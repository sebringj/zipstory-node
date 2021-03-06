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

app.all('*', function(req, res, next) {
	if (req.path.indexOf('/getimages') > -1) {
		next();
		return;
	}
	res.writeHead(200, {
		"Access-Control-Allow-Origin" : "*",
		"Access-Control-Allow-Headers": "X-Requested-With"
	});
	next();
});

app.get('/', function (req, res) {
	res.end('');
});

app.get('/referer', function(req, res){
	res.end(req.headers['referer']);
});

app.get('/getimages', function(req, res) {
	var urlParam = url.parse(req.url,true).query.url,
		jsdom = require('jsdom'),
		referer = req.headers['referer'],
		refererSplit = [];
	
	if (referer) {
		refererSplit = url.parse(referer.toLowerCase()).hostname.split('.');
	}
		
	if (!referer || refererSplit.length !== 3 || refererSplit[1] !== 'zipstory' || refererSplit[2] !== 'com') {
		res.end('bad referer');
		return;
	}
		
	jsdom.env({
		html: urlParam,
		scripts: ['http://code.jquery.com/jquery.js'],
		done: function (errors, window) {
			if (errors && errors.length) {
				res.jsonp({
					success : false,
					message : urlParam
				});
				return;
			}
			function extractImageURL(src, arr) {
				var i = 0, len = arr.length, index, token, tl;
				for(;i < len; i++) {
					token = '.' + arr[i];
					tl = token.length;
					index = src.indexOf(token);
					if (index > -1) {
						return src.substr(0,index+tl);
					}
				}
				return src;
			}
			
			var $ = window.jQuery, images = [], hash = {}, src,
			imgArr = ['jpeg','jpg','gif','png','svg','bmp'], 
			urlParsed = url.parse(urlParam);
			
			$('img').each(function() {
				src = extractImageURL($(this).attr('src'),imgArr);
				if (/^\/\//.test(src)) {
					src = 'http:' + src;
				} else if (/^http(s)?:\/\//.test(src)) {
					// leave as is
				} else if (/:\/\//.test(src)) {
					return;
				} else {
					src = 'http://' + urlParsed.host + url.resolve(urlParsed.pathname, src);
				}
				if (!hash[src]) {
					images.push(src);
					hash[src] = true;
				}
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

app.get('/signout/:user', function(req, res) {
	if (!isAuthorized(req, res)) { return; }
	if (users[req.params.user]) {
		cleanup(users[req.params.user].socketID);
	}
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
	res.end('ok');
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

