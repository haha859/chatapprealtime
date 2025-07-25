const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const MessageSchema = new Schema({
  groupId: { type: Schema.Types.ObjectId, ref: 'Group' },
  sender: { type: Schema.Types.ObjectId, ref: 'User' },
  content: String,
  image: String,
  seenBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Message', MessageSchema);