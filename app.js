var express = require('express'),
    app = express(),
    server = app.listen(80),
    io = require('socket.io').listen(server, { log: false }),
	utils = require('./utils'),
	qs = require('querystring'),
	url = require('url');
    
app.use(express.bodyParser());

var users = {};
var channels = {};
var sockets = {};

function init(data, socket) {
	cleanup(socket.id);
    data.socket = socket;
    data.socketID = socket.id;
    sockets[socket.id] = data;
    users[data.username] = data;
	var channelList = data.channel.split(','), i, len, channel;
	for(i = 0, len = channelList.length; i < len; i++) {
		channel = channelList[i];
	    if (!channels[channel]) {
	        channels[channel] = {};
	    }	
		channels[channel][data.username] = data;
	}
}

function isAuthorized(req, res) {
	var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    if (ip !== '216.121.124.130') {
        // todo: basic auth w/ ssl
		res.send(200);
		res.end(JSON.stringify(req.headers));
        return false;
    }
	res.send(200);
    return true;
}

function cleanup(socketID) {
    var data = sockets[socketID], i, len, c, z, channelList, channel;
	if (!data) { return; }
    delete users[data.username];
	channelList = data.channel.split(',');
	for(i = 0, len = channelList.length; i < len; i++) {
		channel = channelList[i];
	    if (channels[channel]) { delete channels[channel][data.username]; }
	    c = 0;
	    for(z in channels[channel]) { c++; break; }
	    if (c === 0) { delete channels[channel]; }
	}
    delete sockets[socketID];
}

/********** express.js routes ************/
app.all('/*', function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "X-Requested-With");
    next();
});

app.get('/', function (req, res) {
    res.send(200);
});

app.get('/usercount', function(req, res){ 
    var count = 0;
    for (var u in users) {
        if (users.hasOwnProperty(u)) {
           ++count;
        }
    }
    res.end(JSON.stringify({usercount : count }));
});

app.get('/channelcount/:channel', function(req, res){
	var channel = channels[req.params.channel], count = 0;
	if (channel) {
		for (var u in channel) {
			++count;
		}
	}
	res.end(JSON.stringify({channelcount : count }));
});

app.post('/channels/:channel/:action', function(req, res) {
    var data, i, channel, socket;
    if (!isAuthorized(req, res)) { return; }
    channel = channels[req.params.channel];
    if (channel) {
        for(i in channel) {
            socket = channel[i].socket;
            if (typeof(socket) !== 'undefined') {
                socket.json.emit(req.params.action, req.body.message);
            } else {
                cleanup(channel[i].socketID);
            }
        }
    }
    res.send(200);
});

app.post('/users/:to/:action', function (req, res) {
    var data;
    if (!isAuthorized(req, res)) { return; }
    if (users[req.params.to]) {
        data = users[req.params.to];
        if (data.socket) {
            data.socket.json.emit(req.params.action, req.body.message);  
        } else {
            cleanup(data.socketID);
            res.send(200);
            return;
        }
        res.send(200);
    } else {
        res.send(200);
    }
});

/********** socket.io work ***************/
io.sockets.on('connection', function(socket) {
    socket.on('init', function(data) {
		utils.getJSON({ 
			host : 'www.zipstory.com', 
			path : '/handlers/VerifySessionID.ashx?sessionID=' + qs.escape(data.username) 
			}, function(resultCode, json) {
				console.log(resultCode);
				if (resultCode === 200 && json.success) {
					init(data, socket);
					console.log('init');
				} else {
					socket.disconnect();
					console.log('disconnect');
				}
			}
		);
    });
    socket.on('reinit', function(data) {
		init(data, socket);
    });
    socket.on('disconnect', function() {
        cleanup(socket.id);
    });
});

