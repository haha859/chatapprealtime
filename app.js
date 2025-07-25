const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const bcrypt = require('bcrypt');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });

// Thay đổi connection string để dùng MongoDB Atlas
mongoose.connect('mongodb+srv://khanghehe1357:IgdG3zTZkBHXMCwk@cluster0.hh83mqd.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0');

const User = require('./models/User');
const FriendRequest = require('./models/FriendRequest');
const Group = require('./models/Group');
const Message = require('./models/Message');
const PrivateMessage = require('./models/PrivateMessage');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.set('view engine', 'ejs');

app.use(session({
  secret: 'mysecret',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: 'mongodb+srv://khanghehe1357:IgdG3zTZkBHXMCwk@cluster0.hh83mqd.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0' })
}));

function isAuthenticated(req, res, next) {
  if (req.session.userId) return next();
  res.redirect('/login');
}

// Auth routes
app.get('/register', (req, res) => res.render('register'));
app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  if (await User.findOne({ username })) return res.render('register', { msg: 'User exists!' });
  const hashed = await bcrypt.hash(password, 10);
  await User.create({ username, password: hashed, displayName: username });
  res.redirect('/login');
});

app.get('/login', (req, res) => res.render('login'));
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username });
  if (!user || !(await bcrypt.compare(password, user.password)))
    return res.render('login', { msg: 'Login failed!' });
  req.session.userId = user._id;
  res.redirect('/');
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// Dashboard
app.get('/', isAuthenticated, async (req, res) => {
  const user = await User.findById(req.session.userId).populate('friends pinnedGroups hiddenGroups');
  const groups = await Group.find({ members: user._id }).populate('members');
  res.render('dashboard', { user, groups });
});

// Profile
app.get('/profile', isAuthenticated, async (req, res) => {
  const user = await User.findById(req.session.userId);
  res.render('profile', { user });
});
app.post('/profile/displayname', isAuthenticated, async (req, res) => {
  await User.findByIdAndUpdate(req.session.userId, { displayName: req.body.displayName });
  res.redirect('/profile');
});

// Add friend
app.post('/add_friend', isAuthenticated, async (req, res) => {
  const { username } = req.body;
  const friend = await User.findOne({ username });
  if (!friend || friend._id.equals(req.session.userId)) return res.redirect('/');
  if (await FriendRequest.findOne({ from: req.session.userId, to: friend._id })) return res.redirect('/');
  if (await userAlreadyFriend(req.session.userId, friend._id)) return res.redirect('/');
  await FriendRequest.create({ from: req.session.userId, to: friend._id });
  res.redirect('/');
});
async function userAlreadyFriend(userId, friendId) {
  const user = await User.findById(userId);
  return user.friends.includes(friendId);
}

// Friend requests
app.get('/friend_requests', isAuthenticated, async (req, res) => {
  const requests = await FriendRequest.find({ to: req.session.userId }).populate('from');
  const user = await User.findById(req.session.userId);
  res.render('friend_requests', { requests, user });
});
app.post('/accept_friend', isAuthenticated, async (req, res) => {
  const { requestId } = req.body;
  const reqDoc = await FriendRequest.findById(requestId);
  if (!reqDoc) return res.redirect('/friend_requests');
  await User.findByIdAndUpdate(req.session.userId, { $addToSet: { friends: reqDoc.from } });
  await User.findByIdAndUpdate(reqDoc.from, { $addToSet: { friends: req.session.userId } });
  await FriendRequest.findByIdAndDelete(requestId);
  res.redirect('/friend_requests');
});
app.post('/unfriend', isAuthenticated, async (req, res) => {
  const { friendId } = req.body;
  await User.findByIdAndUpdate(req.session.userId, { $pull: { friends: friendId } });
  await User.findByIdAndUpdate(friendId, { $pull: { friends: req.session.userId } });
  res.redirect('/');
});

// Group
app.post('/create_group', isAuthenticated, async (req, res) => {
  const { groupName, members } = req.body;
  let arr = Array.isArray(members) ? members : [members];
  arr = arr.filter(x => x && x !== req.session.userId);
  if (arr.length < 2) return res.redirect('/');
  arr.push(req.session.userId);
  const group = await Group.create({ name: groupName, members: arr, owner: req.session.userId });
  res.redirect(`/group/${group._id}`);
});
app.get('/group/:groupId', isAuthenticated, async (req, res) => {
  const group = await Group.findById(req.params.groupId).populate('members owner');
  if (!group.members.some(m => m._id.equals(req.session.userId))) return res.redirect('/');
  const messages = await Message.find({ groupId: group._id }).populate('sender').sort({ createdAt: 1 });
  res.render('group', { group, userId: req.session.userId, messages });
});
app.post('/group/:groupId/invite', isAuthenticated, async (req, res) => {
  const { username } = req.body;
  const group = await Group.findById(req.params.groupId);
  const user = await User.findOne({ username });
  if (user && !group.members.includes(user._id)) {
    group.members.push(user._id);
    await group.save();
  }
  res.redirect(`/group/${group._id}`);
});
app.post('/group/:groupId/upload', isAuthenticated, upload.single('image'), async (req, res) => {
  const { groupId } = req.params;
  if (!req.file) return res.redirect(`/group/${groupId}`);
  await Message.create({
    groupId,
    sender: req.session.userId,
    image: req.file.filename
  });
  res.redirect(`/group/${groupId}`);
});
app.post('/group/:groupId/kick', isAuthenticated, async (req, res) => {
  const group = await Group.findById(req.params.groupId);
  if (group.owner.equals(req.session.userId)) {
    await Group.findByIdAndUpdate(req.params.groupId, { $pull: { members: req.body.userId } });
  }
  res.redirect(`/group/${group._id}`);
});
app.post('/group/:groupId/hide', isAuthenticated, async (req, res) => {
  await User.findByIdAndUpdate(req.session.userId, { $addToSet: { hiddenGroups: req.params.groupId } });
  res.redirect('/');
});
app.post('/group/:groupId/unhide', isAuthenticated, async (req, res) => {
  await User.findByIdAndUpdate(req.session.userId, { $pull: { hiddenGroups: req.params.groupId } });
  res.redirect('/');
});
app.post('/group/:groupId/pin', isAuthenticated, async (req, res) => {
  await User.findByIdAndUpdate(req.session.userId, { $addToSet: { pinnedGroups: req.params.groupId } });
  res.redirect('/');
});
app.post('/group/:groupId/unpin', isAuthenticated, async (req, res) => {
  await User.findByIdAndUpdate(req.session.userId, { $pull: { pinnedGroups: req.params.groupId } });
  res.redirect('/');
});

// Chat riêng
app.get('/chat/:friendId', isAuthenticated, async (req, res) => {
  const friend = await User.findById(req.params.friendId);
  if (!friend) return res.redirect('/');
  const messages = await PrivateMessage.find({
    $or: [
      { from: req.session.userId, to: friend._id },
      { from: friend._id, to: req.session.userId }
    ]
  }).populate('from').sort({ createdAt: 1 });
  res.render('private_chat', { userId: req.session.userId, friend, messages });
});
app.post('/chat/:friendId/upload', isAuthenticated, upload.single('image'), async (req, res) => {
  const { friendId } = req.params;
  if (!req.file) return res.redirect(`/chat/${friendId}`);
  await PrivateMessage.create({
    from: req.session.userId,
    to: friendId,
    image: req.file.filename
  });
  res.redirect(`/chat/${friendId}`);
});

// Message CRUD
app.post('/group/:groupId/message/:messageId/delete', isAuthenticated, async (req, res) => {
  const message = await Message.findById(req.params.messageId);
  if (message && message.sender.equals(req.session.userId)) {
    await Message.deleteOne({ _id: message._id });
  }
  res.redirect(`/group/${req.params.groupId}`);
});
app.post('/group/:groupId/message/:messageId/edit', isAuthenticated, async (req, res) => {
  await Message.updateOne({ _id: req.params.messageId, sender: req.session.userId }, { content: req.body.content });
  res.redirect(`/group/${req.params.groupId}`);
});
app.post('/chat/:friendId/message/:messageId/delete', isAuthenticated, async (req, res) => {
  const message = await PrivateMessage.findById(req.params.messageId);
  if (message && message.from.equals(req.session.userId)) {
    await PrivateMessage.deleteOne({ _id: message._id });
  }
  res.redirect(`/chat/${req.params.friendId}`);
});
app.post('/chat/:friendId/message/:messageId/edit', isAuthenticated, async (req, res) => {
  await PrivateMessage.updateOne({ _id: req.params.messageId, from: req.session.userId }, { content: req.body.content });
  res.redirect(`/chat/${req.params.friendId}`);
});

// SOCKET.IO REALTIME
io.on('connection', socket => {
  socket.on('join-group', groupId => socket.join(groupId));
  socket.on('group-message', async ({ groupId, userId, username, message }) => {
    const msg = await Message.create({
      groupId, sender: userId, content: message, seenBy: [userId]
    });
    io.to(groupId).emit('group-message', {
      _id: msg._id, username, message, userId, seenBy: [userId]
    });
  });
  socket.on('seen-group-message', async ({ groupId, messageId, userId }) => {
    await Message.updateOne({ _id: messageId }, { $addToSet: { seenBy: userId } });
    io.to(groupId).emit('message-seen', { messageId, userId });
  });

  socket.on('join-private', ({ userId, friendId }) => {
    socket.join([userId, friendId].sort().join('-'));
  });
  socket.on('private-message', async ({ from, to, message, username }) => {
    const msg = await PrivateMessage.create({ from, to, content: message, seenBy: [from] });
    const room = [from, to].sort().join('-');
    io.to(room).emit('private-message', {
      _id: msg._id, username, message, from, seenBy: [from]
    });
  });
  socket.on('seen-private-message', async ({ messageId, userId, friendId }) => {
    await PrivateMessage.updateOne({ _id: messageId }, { $addToSet: { seenBy: userId } });
    const room = [userId, friendId].sort().join('-');
    io.to(room).emit('message-seen', { messageId, userId });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Server started on port', PORT));