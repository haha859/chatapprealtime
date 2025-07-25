const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const PrivateMessageSchema = new Schema({
  from: { type: Schema.Types.ObjectId, ref: 'User' },
  to: { type: Schema.Types.ObjectId, ref: 'User' },
  content: String,
  image: String,
  seenBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('PrivateMessage', PrivateMessageSchema);