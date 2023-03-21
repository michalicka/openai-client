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

const sendMessage = async (query, stream) => {
	console.log(query);
  	const req = https.request({
		hostname: "api.openai.com",
		port: 443,
		path: "/v1/chat/completions",
		method: "POST",
		headers:{
			"Content-Type": "application/json",
			"Authorization": `Bearer ${process.env.OPENAI_KEY}`,
			"OpenAI-Organization": process.env.OPENAI_ORG
		}
	}, function(res) {
		res.on('data', (chunk) => {
			if (process.env.DEBUG) {
				const data = chunk.toString().trim();
				const regex = /"content":"([^\"]*?)"/;
				const match = regex.exec(data);
				if (match) process.stdout.write(match[1]);
			}
			stream.write(chunk);
			if (chunk.toString().trim().indexOf('data: [DONE]') >= 0) {
				stream.end();
				if (process.env.DEBUG) console.log('[DONE]');
			}
		});
	})

	const body = JSON.stringify(Object.assign({}, {
		model: "gpt-3.5-turbo",
		temperature: 0.8,
		top_p: 1,
		n: 1,
		stream: true,
		max_tokens: 4096 - JSON.stringify(query.messages).length,
		stream: true
	}, query))

	req.on('error', (e) => {
		console.error("problem with request:"+ e.message);
	});

	req.write(body);

	req.end();
};

app.get("/", (req, res) => {
	const { q, s } = req.query;
	sendMessage({ messages: [
		{role: "system", content: s ?? "You are a helpful assistant."},
		{role: "user", content: q}
	]}, res);
});

app.post("/", (req, res) => {
	let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      const query = JSON.parse(body);
      sendMessage(query, res);
    });
});

http.createServer(app).listen(process.env.HTTP_PORT);
console.log(`Started on http://localhost:${process.env.HTTP_PORT}/`);

if (process.env.HTTPS_PORT) {
	https.createServer(options, app).listen(process.env.HTTPS_PORT);
	console.log(`Started on https://localhost:${process.env.HTTPS_PORT}/`);
}
