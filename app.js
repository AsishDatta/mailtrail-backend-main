import express from 'express';
import path from "path";
import mongoose from 'mongoose';
import axios from 'axios';
import { v4 } from 'uuid';
import Token from './models/token.js';
import RequestDetails from './models/details.js';
import UAParser from 'ua-parser-js';
import dotenv from 'dotenv';
import cors from 'cors';
import bodyParser from 'body-parser';
dotenv.config();

process.on('unhandledRejection', (error) => {
    console.error(error);
});

const app = express();
app.set('trust proxy', true);
app.use(cors());
const port = process.env.PORT || 5000;
const __dirname = path.resolve();
const mongodbURI = process.env.MONGODB_URI;

//bodyParser middleware to parse the request body
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const dbReady = mongoose.connect(mongodbURI, { serverSelectionTimeoutMS: 20000 });
dbReady.catch((error) => {
    console.error('MongoDB connection failed:', error.message);
});

function databaseUnavailable(res, error) {
    console.error(error);
    const detail = String(error?.message || 'database_unavailable')
        .split('\n')[0]
        .replace(/mongodb(\+srv)?:\/\/\S+/gi, 'mongodb://***');
    res.status(500).json({ error: 'database_unavailable', detail });
}

async function ensureDb(res) {
    try {
        await dbReady;
        return true;
    } catch (error) {
        databaseUnavailable(res, error);
        return false;
    }
}

function formatKolkata(betweenDateAndTime) {
    const dateTime = new Date();
    const date = dateTime.toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata' });
    const time = dateTime.toLocaleTimeString('en-US', { hour12: true, timeZone: 'Asia/Kolkata' });
    return `${date}${betweenDateAndTime}${time}`;
}

app.get('/', (req, res, next) => {
    if (req.query.token) return next();
    res.send('APIs are up and running');
});

app.post(['/api/newToken', '/newToken'], async (req, res) => {
    try {
        if (!(await ensureDb(res))) return;
        const token = v4();
        const formattedDateTime = formatKolkata(', ');

        const newToken = new Token({ _id: token, emailTitle: req.body.emailTitle, createdAt: formattedDateTime });
        await newToken.save();
        console.log("New token created: " + token);
        res.send(token);
    } catch (error) {
        console.error(error);
        res.status(500).send('Failed to create token');
    }
});

app.get(['/api', '/'], async (req, res) => {
    const token = req.query.token;
    let ua = req.get('User-Agent');
    let parser = new UAParser(ua);
    const forwarded = req.headers['x-forwarded-for'];
    const ip = (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : req.ip) || req.socket.remoteAddress;
    let location;
    await axios.get(`http://ip-api.com/json/${ip}`)
        .then(response => { location = `${response.data.city}, ${response.data.regionName}`; })
        .catch(error => {
            console.log(error);
        });
    //log time of every new request to the api
    const formattedDateTime = formatKolkata(' at ');

    const details = {
        accessedAt: formattedDateTime,
        platform: parser.getOS().name,
        browser: parser.getBrowser().name,
        ip: ip,
        location: location,
    };

    //check if the token exists in the database 
    if (!(await ensureDb(res))) return;
    let tokenExists;
    try {
        tokenExists = await Token.exists({ _id: token });
    } catch (error) {
        return databaseUnavailable(res, error);
    }
    if (tokenExists) {
        const detailsExists = await RequestDetails.exists({ _id: token });
        if (detailsExists) {
            const requestDetails = await RequestDetails.findOne({ _id: token });
            if (requestDetails.totalAccessed >= 2) {
                // update the totalAccessed field in the database by 1
                await RequestDetails.updateOne({ _id: token }, { $inc: { totalAccessed: 1 } });
                // push the details of the current request to the accessDetails array
                await RequestDetails.updateOne({ _id: token }, { $push: { accessDetails: details } });
            } else {
                await RequestDetails.updateOne({ _id: token }, { $inc: { totalAccessed: 1 } });
            }
        } else {
            // create a new document in the database
            const accessDetails = new RequestDetails({
                _id: token,
                totalAccessed: 1,
                // accessDetails: [details]
            });
            await accessDetails.save();
        }
        res.sendFile(__dirname + '/1x1.png');
    } else {
        res.send('Invalid token');
    }
});

app.get(['/api/getTokens', '/getTokens'], async (req, res) => {
    console.log("Get tokens request received");
    if (!(await ensureDb(res))) return;
    try {
        const tokens = await Token.find();
        res.send(tokens);
    } catch (error) {
        databaseUnavailable(res, error);
    }
});

app.get(['/api/getDetails', '/getDetails'], async (req, res) => {
    console.log("Get details request received");
    const token = req.query.token;
    if (!(await ensureDb(res))) return;
    try {
        const tokenDetails = await RequestDetails.findById(token);
        res.send(tokenDetails);
    } catch (error) {
        databaseUnavailable(res, error);
    }
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});