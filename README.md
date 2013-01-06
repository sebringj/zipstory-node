# ZIPSTORY NODE
A very simple real-time messaging app that was built specifically for zipstory.com 
but is generic enough to be used in other websites. 

This is an add-on app to a website that you want to have real-time notifications for
# User-specific Messages
Allows for user-specific messages based on session ID supplied by the consuming website
# Channel Messages (Group Messages)
Allows for messages to be sent for a group of people. In zipstory.com's case, 
the "channel" is considered to be the page you are on or the group you are in, etc.
# Security
The security is minimal but for now is effective enough
  1. The app only allows a socket connection if the incoming session ID exists on the consuming website through a callback check
  2. The app only accepts incoming messages through HTTPS and a SECRET on the querystring (later modify to sha1 signature check)