var port = process.env.PORT || 80;
var express = require('express'),
    app = express(),
    server = app.listen(port),
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
	var parsedURL = url.parse(req.url,true);
	//var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
	if (process.env.SECRET !== parsedURL.query.SECRET) {
		res.end('unauthorized');
		res.end(JSON.stringify(req.headers));
        return false;
    }
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

app.get('/', function (req, res) {
	res.writeHead(200, {
		"Access-Control-Allow-Origin" : "*",
		"Access-Control-Allow-Headers": "X-Requested-With"
	});
	res.end('');
});

app.get('/getimages', function(req, res) {
	var urlParam = url.parse(req.url,true).query.url,
		jsdom = require('jsdom'),
		referer = req.headers['referer'];
		
	if (!referer || url.parse(referer).hostname !== 'www.zipstory.com') {
		res.end('bad referer');
	}
		
	jsdom.env({
		html: urlParam,
		scripts: ['http://code.jquery.com/jquery.js'],
		done: function (errors, window) {
			if (errors && errors.length) {
				res.jsonp({
					success : false,
					message : 'badurl'
				});
				return;
			}
			var $ = window.jQuery, images = [];
			$('img').each(function(){
				images.push($(this).attr('src'));
			});
			res.jsonp({
				success : true,
				images : images
			});	
		}
	});
});

app.get('/usercount', function(req, res){ 
    var count = 0;
    for (var u in users) {
        if (users.hasOwnProperty(u)) {
           ++count;
        }
    }
	res.writeHead(200, {
		"Access-Control-Allow-Origin" : "*",
		"Access-Control-Allow-Headers": "X-Requested-With"
	});
    res.end(JSON.stringify({usercount : count }));
});

app.get('/channelcount/:channel', function(req, res){
	var channel = channels[req.params.channel], count = 0;
	if (channel) {
		for (var u in channel) {
			++count;
		}
	}
	res.writeHead(200, {
		"Access-Control-Allow-Origin" : "*",
		"Access-Control-Allow-Headers": "X-Requested-With"
	});
	res.end(JSON.stringify({channelcount : count }));
});

app.get('/signout/:user', function(req, res) {
	if (!isAuthorized(req, res)) { return; }
	if (users[req.params.user]) {
		cleanup(users[req.params.user].socketID);
	}
	res.writeHead(200, {
		"Access-Control-Allow-Origin" : "*",
		"Access-Control-Allow-Headers": "X-Requested-With"
	});
	res.end(JSON.stringify({success : true }));
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
	res.writeHead(200, {
		"Access-Control-Allow-Origin" : "*",
		"Access-Control-Allow-Headers": "X-Requested-With"
	});
	res.end('ok');
});

app.post('/users/:to/:action', function (req, res) {
    var data;
    if (!isAuthorized(req, res)) { return; }
	res.writeHead(200, {
		"Access-Control-Allow-Origin" : "*",
		"Access-Control-Allow-Headers": "X-Requested-With"
	});
    if (users[req.params.to]) {
        data = users[req.params.to];
        if (data.socket) {
            data.socket.json.emit(req.params.action, req.body.message);  
        } else {
            cleanup(data.socketID);
            res.send(200);
            return;
        }
		res.end('user ok');
    } else {
		res.end('user not found');
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

