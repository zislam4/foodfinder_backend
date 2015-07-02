// Initialization
var express = require('express');
var bodyParser = require('body-parser');
var validator = require('validator');
var chrono = require('chrono-node');
var moment = require('moment');
var schedule = require('node-schedule');
moment().format();

var sendgrid  = require('sendgrid')(process.env.SENDGRID_USERNAME, process.env.SENDGRID_PASSWORD);

// See documentation at https://github.com/chriso/validator.js
var app = express();
//var server = http.createServer(app);

// See https://stackoverflow.com/questions/5710358/how-to-get-post-query-in-express-node-js
app.use(bodyParser.json());
// See https://stackoverflow.com/questions/25471856/express-throws-error-as-body-parser-deprecated-undefined-extended
app.use(bodyParser.urlencoded({ extended: true }));

app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

// Mongo initialization and connect to database
var mongoUri = process.env.MONGOLAB_URI || process.env.MONGOHQ_URL || 'mongodb://localhost/foodfinder';
var MongoClient = require('mongodb').MongoClient, format = require('util').format;
var db = MongoClient.connect(mongoUri, function(error, databaseConnection) {
	db = databaseConnection;
});

app.post('/addEvent', function(request, response) {
	var eventname = request.body.eventname;
	var date = request.body.date;
	var location = request.body.location;
	var starttime = request.body.starttime;
	var endtime = request.body.endtime;
	var details = request.body.details;

	// Gah! We have to convert time and date into a single entity: start
	// Same idea with end...
	// "start":"2015-04-18T12:00:00","end":"2015-04-18T17:30:00"

	var event = {
		"title": eventname,
		"location":location,
		"start":date + "T" + starttime + ":00",
		"end":date + "T" + endtime + ":00",
		"posting":details,
	};

	db.collection('events', function(er, collection) {
		collection.insert(event, function(err, saved) {
			if (err) {
				response.send(500);
			} else {
				response.send("Congratulations, your event was added!");
			}
		});
	});
});

app.get('/test', function(request, response) {
	response.set('Content-Type', 'text/html');
	var message = "There is pizza in the South Lounge. Grab a slice!";
	var parseResult = chrono.parse(message);
	if (parseResult[0] == undefined) {
		response.send(200);
		return;
	}
	if (parseResult[0].start == undefined || parseResult[0].start == null) {
		response.send(500);
		return;
	}
	else {
		var start = parseResult[0].start.date();
	}
	if (parseResult[0].end == null || parseResult[0].end == undefined) {
		var end = moment(start).add(1, 'hours').toISOString();
	}
	else {
		var end = parseResult[0].end.date();
	}
	var location = "Please check the posting";
	var anEvent = {
		"title": "Free",
		"start": start,
		"end": end,
		"location": location,
		"posting": message
	}
	response.send(JSON.stringify(anEvent));

});

// API for receiving email; will be parsed into an event ob.
// LOG: Fix locations
// https://frozen-shelf-9907.herokuapp.com/incoming_mail
app.post('/incoming_mail', function(req, res){
	var message = req.body["plain"];
	var subject = req.body["headers"]["Subject"];
	var parseResult = chrono.parse(message);
	if (parseResult[0] == undefined) {
		res.send(200);
		return;
	}
	if (parseResult[0].start == undefined || parseResult[0].start == null) {
		res.send(500);
		return;
	}
	else {
		var start = parseResult[0].start.date();
	}
	if (parseResult[0].end == null || parseResult[0].end == undefined) {
		var end = moment(start).add(1, 'hours').toISOString();
	}
	else {
		var end = parseResult[0].end.date();
	}
	var location = "Please check the posting";
	var anEvent = {
		"title": subject,
		"start": start,
		"end": end,
		"location": location,
		"posting": message
	}
	db.collection('events', function(er, collection) {
		collection.insert(anEvent, function(err, saved) {
			if (err) {
				res.send(500);
			} else {
				res.send(200);
			}
		});
	});
/* Email is temporary commented out
  email = {
  	"subject":req.body["headers"]["Subject"],
  	"message":req.body["plain"]
  }

  db.collection('emails', function(er, collection) {
	collection.insert(email, function(err, saved) {
		if (err) {
			res.sendStatus(500);
		} else {
			res.sendStatus(200);
			}
		});
	}); */
  });

app.get('/', function(request, response) {

	response.set('Content-Type', 'text/html');
	db.collection('events', function(er, collection) {
		collection.find().toArray(function(err, cursor) {
			if (!err) {
				response.send(JSON.stringify(cursor));
			} else {
				response.send('Sorry, no events');
			}
		});
	});
});

//E-list management

app.post('/addEmail', function(request, response) {
	var toInsert = {
		"email": request.body.email
		}

	db.collection('elist', function(er, collection) {
		collection.remove(toInsert);		
		collection.insert(toInsert);
	});
	response.send("Congratulations, your email was added!");
});

var j = schedule.scheduleJob({minute: 28, dayOfWeek: 5}, function(){
   	console.log('The answer to life, the universe, and everything!');
	var toSend = new sendgrid.Email();
	//get all emails from database
	db.collection('elist', function(er, collection) {
		if (!er) {
			collection.find().toArray(function(err, cursor) {
				if (!err) {
					for(var i = 0; i < cursor.length; i++) {
						toSend.addTo(cursor[i].email);				
					}
					toSend.setFrom("mchow@cs.tufts.edu");
					toSend.setSubject("Free food events this week!");
	
					var msgText = "<!DOCTYPE html><html><body><h1>Here are the free food events this week:</h1><ul>";
	
					db.collection('events', function(er, collection) {
						if (!er) {
							var now = moment().toISOString();
							var nextWeek = moment().add(7, 'days').toISOString();
							collection.find( { "start": { $gt: now, $lt: nextWeek } } ).toArray(function(err, cursor) {
								for (var i = 0; i < cursor.length; i++) {
									console.log(cursor[i].title);
									msgText += "<li>Event name: " + cursor[i].title + "<br>" +
										"Location: " + cursor[i].location + "<br>" +
										"Date: " + moment(cursor[i].start).format('MMMM Do YYYY, 															h:mm a') + "<br></li>";
								}
								msgText += "</li></body></html>";
								toSend.setHtml(msgText);

								sendgrid.send(toSend, function(err, json) {
								if (err) { return console.error(err); }
									console.log(json);
								});
							});
						}
					});
				}
			});
		}
	});
});


// Oh joy! http://stackoverflow.com/questions/15693192/heroku-node-js-error-web-process-failed-to-bind-to-port-within-60-seconds-of
app.listen(process.env.PORT || 3000);
