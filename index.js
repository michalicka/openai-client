require('dotenv').config();

const express = require('express');
const https = require('https');
const http = require('http');
const fs = require('fs');

const options = process.env.HTTPS_PORT ? {
  key: fs.readFileSync(process.env.SSL_KEY),
  cert: fs.readFileSync(process.env.SSL_CRT)
} : {};

const app = express();

app.use(function (req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    next();
});

const sendMessage = async (message, stream) => {
  	const req = https.request({
		hostname: "api.openai.com",
		port: 443,
		path: "/v1/completions",
		method: "POST",
		headers:{
			"Content-Type": "application/json",
			"Authorization": `Bearer ${process.env.OPENAI_KEY}`,
			"OpenAI-Organization": process.env.OPENAI_ORG
		}
	}, function(res) {
		res.on('data', (chunk) => {
			if (process.env.DEBUG) console.log(chunk.toString().trim());
			stream.write(chunk);
		});
	})

	const body = JSON.stringify({
		model: "text-davinci-003",
		prompt: message,
		temperature: 0,
		top_p: 1,
		n: 1,
		stream: true,
		logprobs: null,
		max_tokens: 2048,
		stream:true
	})

	req.on('error', (e) => {
		console.error("problem with request:"+ e.message);
	});

	req.write(body);

	req.end();
};

app.get("/", (req, res) => {
	const { q } = req.query;
	sendMessage(q, res);
});

http.createServer(app).listen(process.env.HTTP_PORT);
console.log(`Started on http://localhost:${process.env.HTTP_PORT}/`);

if (process.env.HTTPS_PORT) {
	https.createServer(options, app).listen(process.env.HTTPS_PORT);
	console.log(`Started on https://localhost:${process.env.HTTPS_PORT}/`);
}
