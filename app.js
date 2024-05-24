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

const app = express();
app.use(cors());
const port = process.env.PORT || 5000;
const __dirname = path.resolve();
const mongodbURI = process.env.MONGODB_URI;

//bodyParser middleware to parse the request body
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

//create connection to mongodb
mongoose.connect(mongodbURI, { useNewUrlParser: true, useUnifiedTopology: true });

app.get('/', (req, res) => {
    res.send('APIs are up and running');
});

app.post('/api/newToken', async (req, res) => {
    const token = v4();
    // const date = new Date();
    let dateTimeString;
    await axios.get("http://worldtimeapi.org/api/timezone/Asia/Kolkata")
        .then((res) => {
            dateTimeString = res.data.datetime;
        });

    const dateTime = new Date(dateTimeString);

    const date = dateTime.toLocaleDateString('en-GB');
    const time = dateTime.toLocaleTimeString('en-US', { hour12: true, timeZone: 'Asia/Kolkata' });

    const formattedDateTime = `${date}, ${time}`;

    const newToken = new Token({ _id: token, emailTitle: req.body.emailTitle, createdAt: formattedDateTime });
    await newToken.save();
    console.log("New token created: " + token);
    res.send(token);
});

app.get('/api', async (req, res) => {
    const token = req.query.token;
    let ua = req.get('User-Agent');
    let parser = new UAParser(ua);
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    let location;
    await axios.get(`http://ip-api.com/json/${ip}`)
        .then(response => { location = `${response.data.city}, ${response.data.regionName}`; })
        .catch(error => {
            console.log(error);
        });
    //log time of every new request to the api 
    // const date = new Date();
    let dateTimeString;
    await axios.get("http://worldtimeapi.org/api/timezone/Asia/Kolkata")
        .then((res) => {
            dateTimeString = res.data.datetime;
        });

    const dateTime = new Date(dateTimeString);

    const date = dateTime.toLocaleDateString('en-GB');
    const time = dateTime.toLocaleTimeString('en-US', { hour12: true, timeZone: 'Asia/Kolkata' });

    const formattedDateTime = `${date} at ${time}`;

    const details = {
        accessedAt: formattedDateTime,
        platform: parser.getOS().name,
        browser: parser.getBrowser().name,
        ip: ip,
        location: location,
    };

    //check if the token exists in the database 
    const tokenExists = await Token.exists({ _id: token });
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

app.get('/api/getTokens', async (req, res) => {
    console.log("Get tokens request received");
    const tokens = await Token.find();
    res.send(tokens);
});

app.get('/api/getDetails', async (req, res) => {
    console.log("Get details request received");
    const token = req.query.token;
    //fetch details from the database for the given token 
    const tokenDetails = await RequestDetails.findById(token);
    res.send(tokenDetails);
});

app.listen(port, () => {
    console.log('Server running on port 5000');
});