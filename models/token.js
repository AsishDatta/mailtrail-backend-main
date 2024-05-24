import mongoose from 'mongoose';

const TokenSchema = new mongoose.Schema({
    _id: String,
    emailTitle: String,
    createdAt: String
});

//export the model
export default mongoose.model('Token', TokenSchema);