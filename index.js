// Reference the packages we require so that we can use them in creating the bot
const restify = require('restify');
const builder = require('botbuilder');
const rp = require('request-promise');

const emailSender = require('./emailSender');

//=========================================================
// Bot Setup
//=========================================================

// Setup Restify Server
// Listen for any activity on port 3978 of our local server
var server = restify.createServer();
server.listen(process.env.port || process.env.PORT || 3978, function () {
  console.log('%s listening to %s', server.name, server.url);
});

// Create chat bot
var connector = new builder.ChatConnector({
  appId: process.env.MICROSOFT_APP_ID,
  appPassword: process.env.MICROSOFT_APP_PASSWORD
});
var bot = new builder.UniversalBot(connector);
// If a Post request is made to /api/messages on port 3978 of our local server, then we pass it to the bot connector to handle
server.post('/api/messages', connector.listen());

//=========================================================
// Bots Dialogs
//=========================================================

var luisRecognizer = new builder.LuisRecognizer('https://westus.api.cognitive.microsoft.com/luis/v2.0/apps/a2f420df-461e-49a7-84a7-285cc747d50b?subscription-key=99a20ed96cd4486da2843a3fb9d27085&verbose=false&q=');
var intentDialog = new builder.IntentDialog({
  recognizers: [luisRecognizer]
});

intentDialog.matches(/\b(hi|hello|hey|howdy)\b/i, '/sayHi') //Check for greetings using regex
  .matches('GetNews', '/topNews') //Check for LUIS intent to get news
  .matches('AnalyseImage', '/analyseImage') //Check for LUIS intent to analyze image
  .matches('SendEmail', '/sendEmail')
  .onDefault(builder.DialogAction.send("Sorry, I didn't understand what you said.")); //Default message if all checks fail)

// This is called the root dialog. It is the first point of entry for any message the bot receives
bot.dialog('/', intentDialog);

// welcome dialog thing
bot.dialog('/sayHi', session => {
  session.send('sayHi');
  session.endDialog();
});

// Top News
bot.dialog('/topNews', [
  (session) => {
    // Ask the user which category they would like
    // Choices are separated by |
    builder.Prompts.choice(session, "Which category would you like?", "Technology|Science|Sports|Business|Entertainment|Politics|Health|World|(quit)");
  }, (session, results, next) => {
    // The user chose a category
    if (results.response && results.response.entity !== '(quit)') {
      //Show user that we're processing their request by sending the typing indicator
      session.sendTyping();
      // Build the url we'll be calling to get top news
      var url = "https://api.cognitive.microsoft.com/bing/v5.0/news/?" +
        "category=" + results.response.entity + "&count=10&mkt=en-US&originalImg=true";
      // Build options for the request
      var options = {
        uri: url,
        headers: {
          'Ocp-Apim-Subscription-Key': BINGSEARCHKEY
        },
        json: true // Returns the response in json
      }
      //Make the call
      rp(options).then((body) => {
        // The request is successful
        session.send("Managed to get your news.");
        sendTopNews(session, results, body);
      }).catch((err) => {
        // An error occurred and the request failed
        console.log(err.message);
        session.send("Argh, something went wrong. :( Try again?");
      }).finally(() => {
        // This is executed at the end, regardless of whether the request is successful or not
        session.endDialog();
      });
    } else {
      // The user choses to quit
      session.endDialog("Ok. Mission Aborted.");
    }
  }
]);

function sendTopNews(session, results, body) {
  session.send("Top news in " + results.response.entity + ": ");
  //Show user that we're processing by sending the typing indicator
  session.sendTyping();
  // The value property in body contains an array of all the returned articles
  var allArticles = body.value;
  var cards = [];
  // Iterate through all 10 articles returned by the API
  for (var i = 0; i < 10; i++) {
    var article = allArticles[i];
    // Create a card for the article and add it to the list of cards we want to send
    cards.push(new builder.HeroCard(session)
      .title(article.name)
      .subtitle(article.datePublished)
      .images([
        //handle if thumbnail is empty
        builder.CardImage.create(session, article.image.contentUrl)
      ])
      .buttons([
        // Pressing this button opens a url to the actual article
        builder.CardAction.openUrl(session, article.url, "Full article")
      ]));
  }
  var msg = new builder.Message(session)
    .textFormat(builder.TextFormat.xml)
    .attachmentLayout(builder.AttachmentLayout.carousel)
    .attachments(cards);
  session.send(msg);
}

// Analyse image
bot.dialog('/analyseImage', [
  (session) => {
    builder.Prompts.text(session, "Send me an image link of it please.");
  },
  (session, results) => {
    //Options for the request
    var options = {
      method: 'POST',
      uri: 'https://westus.api.cognitive.microsoft.com/vision/v1.0/describe?maxCandidates=1',
      headers: {
        'Ocp-Apim-Subscription-Key': BINGCVKEY,
        'Content-Type': 'application/json'
      },
      body: {
        //https://heavyeditorial.files.wordpress.com/2016/05/harambe-22.jpg?quality=65&strip=all&strip=all
        url: results.response
      },
      json: true
    }
    // Make the request
    rp(options).then(function (body) {
      // Send the caption
      session.send("I think it's " + body.description.captions[0].text)
    }).catch(function (err) {
      console.log(err.message);
      session.send(prompts.msgError);
    }).finally(() => session.endDialog());
  }
]);

bot.dialog('/sendEmail', [
  session => {
    // session.send("I can send an email to your team member on Earth, what's his/her address?");
    builder.Prompts.text(session, 'simi message u want email... mafan leh u');
  },
  (session, results) => {
    console.log(results);
    emailSender.sendEmail(results.response, () => {
      session.send(`Ok email sent to ${results.response}`);
    });
  }
]);