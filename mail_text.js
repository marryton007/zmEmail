var email = require("nodemailer");
var smtpPool = require('nodemailer-smtp-pool');
var line_reader = require("line-reader");
var fs = require("fs");
var async = require("async");
var split = require("strsplit");
var events = require("events");
var S = require("string");

var senders = [];
var receivers = [];
var subjects = [];
var perMail = 10;
var send_idx = 0;
var rec_idx = 0;
var username = '';
var conn = {};
// 该连接发送邮件总数
conn.sendCnt = 0;
// // 失败次数
conn.sendFail = 0;
// // 成功次数
conn.sendOk = 0;
var bodys = [];

//读取所有邮件文本内容，放入bodys数组中。
for (var i = 0; i < 10; i++){
	bodys[i] = fs.readFileSync("body_"+i+".txt", "utf8");
	// console.log(bodys[i]);
	// console.log("------ step "+i+"------\n");
}

// bodys[0] = fs.readFileSync("body.txt", "utf8");

// var sendCnt = 0;
// var sendFail = 0;
// var sendOk = 0;
var emitter = new events.EventEmitter();

// 监听连接关闭事件
emitter.on("CloseConn", function(conn){
	// sendCnt += conn.sendCnt;
	// sendFail += conn.sendFail;
	// sendOk += conn.sendOk;
	send_idx++;
	if(send_idx > senders.length - 1){
		send_idx = senders.length - 1;
	}
	connectServer(buildOption());
	
	if(conn.sendCnt >= receivers.length){
		console.log("");
		console.log("total sent "+ conn.sendCnt + 
		" failed: "+ conn.sendFail + " successed: " + conn.sendOk);
		// 强制退出
		process.exit(0);
	}
});


//准备连接选项
function buildOption(){
	var info = split(senders[send_idx], /\s+/);
	// console.log(info);
	// var opt;
	if(info.length >= 2){
		username = info[0].trim();
		var passwd = info[1].trim();
		if(info.length == 3){
			var host = info[2].trim();				
		}

		var uinfo = split(username, '@');
		var opt = {
			host: host || "smtp." + uinfo[1],
			secure: true,
			auth: {
				user: username,
				pass: passwd,
			},
			maxConnections: 1,
			maxMessages: 1
		}
		
		return opt;
	}else{
		console.log("发送者信息解析失败！");
		process.exit(-2);
	}
	
}

//创建邮件内容
function buildMessage(){
	var recInfo = split(receivers[rec_idx], /\s+/);
	rec_idx++;
	if(rec_idx > receivers.length - 1){
		rec_idx = receivers.length - 1;
	}
	if(recInfo.length == 2){
		var toemail = recInfo[0].trim();
		var toname = recInfo[1].trim();
		// console.log("to = " + to);
	
		var t_sub = subjects[Math.floor(Math.random()*subjects.length)]; 
		var t_info = split(t_sub, /\s+/);
		var msg = {
			from: username,
			to: toemail,
			subject: toname + ", " + t_info[0],
			text: bodys[Math.floor(Math.random()*bodys.length)]
		}
		
		return msg;
	}else{
		console.log("接收者信息解析失败");
		process.exit(-1);
	}
}

//建立连接
function connectServer(options){
	// console.log(options);
	conn.server = email.createTransport(smtpPool(options));
	// var conn = email.createTransport(options);
}

//发送邮件
function sendMsg(){
	setTimeout(function(){
		var msg = buildMessage();
		// console.log(msg);
		conn.server.sendMail(msg, function(err, reponse){
			if(err){
				console.log(" ------- send fiales ------");
				console.log(err);
				console.log(msg);
				console.log("---------------------------");
				conn.sendFail++;
			}else{
				// console.log(reponse);
				// console.log(msg["from"] + " send a email to " + msg["to"] + " OK！");
				conn.sendOk++;
			}
			// sendCnt++;
			conn.sendCnt++;
			console.log("processing... " + Math.floor(conn.sendCnt / receivers.length * 100)+"% ...");
			// console.log("conn.sendCnt = " + conn.sendCnt +", perMail = "+ perMail);
			if(conn.sendCnt >= perMail){
				// console.log("name: "+ conn.name + " total sent "+ conn.sendCnt +
				// " failed: "+ conn.sendFail + " successed: " + conn.sendOk);
				// console.log("");
				//关闭发送池
				conn.server.close();
				//发送连接关闭事件
				emitter.emit("CloseConn", conn);
			}
		});
		setTimeout(arguments.callee, 5000);
	}, 5000);
}

//发送邮件，每个发送者发送10封邮件
function send(cb){
	connectServer(buildOption());
	sendMsg();
	cb(null, "start sending ...");
}

//顺序执行以下函数
async.series([

	//读取receiver.txt文件，获取所有邮件接收地址
	function(cb){
		line_reader.eachLine("receiver.txt", function(line, last){
			if(line.trim().length > 0 && !S(line).startsWith('#')){
				receivers.push(line);				
			}
			if(last){
				// console.log("------ receiver list -----");
				// console.log(receivers.length);
				cb(null, "receivers list length = " + receivers.length);
			}
		});
	
	},
	
	//读取sender.txt文件，获取所有发送人用户名和密码
	function(cb){
		line_reader.eachLine("sender.txt", function(line, last){
			if(line.trim().length > 0 && !S(line).startsWith('#')){
				senders.push(line);				
			}
			if(last){
				// console.log("------- sender list ------");
				// console.log(senders);
				cb(null, "senders list length = "+ senders.length);
			}
		});
	},
	
	function(cb){
		perMail = Math.ceil(receivers.length / senders.length);
		cb(null, "perMail = "+ perMail);
	},
	
	//读取subject.txt文件，取得主题和内容图片
	function(cb){
		line_reader.eachLine("subject.txt", function(line, last){
			if(line.trim().length > 0 && !S(line).startsWith('#')){
				subjects.push(line);
			}
			if(last){
				// console.log("------- subject list ------");
				// console.log(subjects);
				// console.log(subjects.length);
				cb(null, "subjects length = "+subjects.length);
			}
		});
	},
	
	//发送邮件
	function(cb){
		send(cb);
	}

], function(err, result){
	if(err) throw err;
	console.log(result);
	console.log("");
});
