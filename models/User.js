const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const UserSchema = new Schema({
  username: { type: String, unique: true, required: true },
  password: String,
  displayName: String,
  friends: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  pinnedGroups: [{ type: Schema.Types.ObjectId, ref: 'Group' }],
  hiddenGroups: [{ type: Schema.Types.ObjectId, ref: 'Group' }]
});

module.exports = mongoose.model('User', UserSchema);