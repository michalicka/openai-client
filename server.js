require('dotenv').config();

const express = require('express');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');


const options = process.env.SERVER_ENV === 'dev' ? {
  key: fs.readFileSync(process.env.SSL_KEY),
  cert: fs.readFileSync(process.env.SSL_CRT)
} : {};

const app = express();

app.use(function (req, res, next) {
    const allowedOrigins = process.env.ALLOW_ORIGIN.split(',');
	if ((process.env.ALLOW_ORIGIN === '*') || (req.headers.origin && allowedOrigins.includes(new URL(req.headers.origin).hostname))) {
	  res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
	} else {
	  res.setHeader('Access-Control-Allow-Origin', '');
	}
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, OpenAI-Organization');
    next();
});

function incrementRequestStats(hostname, count) {
  if (hostname) {
  	const filename = hostname.replace(/^(https?:\/\/)?(www\.)?/i, '').replace(/\//g, '');
    const filepath = path.join(process.env.VERCEL_WORK_DIR || './stats/', `${filename}.json`);
    const today = new Date().toISOString().slice(0, 10);

    fs.readFile(filepath, 'utf8', (err, data) => {
   	 	let stats = {};
      if (err) {
        if (err.code === 'ENOENT') {
          data = '{}';
        } else {
          console.error(err);
          return;
        }
      } 
      if (data) {
        try {
          stats = JSON.parse(data);
        } catch (err) {
          console.error(err);
        }
      }
	    stats[today] = (stats[today] || 0) + count;
	    fs.writeFile(filepath, JSON.stringify(stats), (err) => {
	      if (err) {
	        console.error(err);
	      }
	    });
    });
  }
}

function sumByMonth(data) {
  const sumByMonth = {};
  for (let date in data) {
    const [year, month] = date.split('-');
    if (!sumByMonth[`${year}-${month}`]) {
      sumByMonth[`${year}-${month}`] = 0;
    }
    sumByMonth[`${year}-${month}`] += data[date];
  }
  return sumByMonth;
}


const sendMessage = async (query, stream, referrer) => {
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
		let chunkCount = 0;
		res.on('data', (chunk) => {
			if (process.env.DEBUG) {
				const data = chunk.toString().trim();
				const regex = /"content":"([^\"]*?)"/;
				const match = regex.exec(data);
				if (match) process.stdout.write(match[1]);
			}
			stream.write(chunk);
			if (chunk.toString().trim().indexOf('data: {') >= 0) {
				chunkCount++;
			}
			if (chunk.toString().trim().indexOf('data: [DONE]') >= 0) {
				stream.end();
				if (process.env.DEBUG) console.log('[DONE]');
				incrementRequestStats(referrer, chunkCount);
			}
		});
	})

	const body = JSON.stringify(Object.assign({}, {
		model: "gpt-3.5-turbo",
		temperature: 0.8,
		top_p: 1,
		n: 1,
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
	const url = new URL(req.headers.referer || 'https://localhost');
	const { q, s } = req.query;
	if (q) sendMessage({ messages: [
		{role: "system", content: s ?? "You are a helpful assistant."},
		{role: "user", content: q}
	]}, res, url.hostname);
	else {
		res.writeHead(200);
  	res.end("data: [DONE]");
	}
});

app.post("/", (req, res) => {
	const url = new URL(req.headers.referer || 'https://localhost');
	let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      const query = JSON.parse(body);
      sendMessage(query, res, url.hostname);
    });
});

app.get('/stats', (req, res) => {
  if (!process.env.ALLOWED_IP.split(',').includes(req.ip)) {
  	return res.status(403).send(`Access denied for ${req.ip}`);
  }
  const { q } = req.query;
  const filePath = path.join(process.env.VERCEL_WORK_DIR || './stats/', `${q}.json`);
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Error reading file');
    }
    res.send(sumByMonth(JSON.parse(data)));
  });
});

http.createServer(app).listen(process.env.HTTP_PORT || 80);
console.log(`Started on http://localhost:${process.env.HTTP_PORT || 80}/`);

if (process.env.HTTPS_PORT) {
	https.createServer(options, app).listen(process.env.HTTPS_PORT || 443);
	console.log(`Started on https://localhost:${process.env.HTTPS_PORT || 443}/`);
}
