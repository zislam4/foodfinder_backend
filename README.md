#Freefoodfinder
A web app that receives and parses emails to populate a free food calendar for Tufts

- Food-related emails are received from Tufts elists
- Emails are parsed to find a description and the start and end date and time, if available
- Events are stored in a MongoDB database
- Events can be accessed via an HTTP get request

- Emails can be added to a database
- Each email in the database will receive a weekly email with a list of free food events
