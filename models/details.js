import mongoose from 'mongoose';

const RequestDetails = new mongoose.Schema({
    _id: String,
    totalAccessed: Number,
    accessDetails: [{
        accessedAt: String,
        platform: String,
        browser: String,
        ip: String,
        location: String,
        userAgent: String,
    }]
});

//export the model
export default mongoose.model('Detail', RequestDetails);