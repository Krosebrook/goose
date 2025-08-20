* we are improving the compaction and summarization ux in this app
* review the diff to date by running: git diff main
* i want to make a refactor now
* instead of appending messages and compaction markers to the conversation that summarization occured, I want to do this on the rust side
* look at the logic which is in /Users/alexhancock/Development/goose/crates/goose-server/src/routes/context.rs where it adds the message which says "I ran into a context length exceeded error so I summarized our conversation".
* make it so when the summarization happens the client updates its message list state in src/components/context_management/ContextManager.tsx based on the server provided messages including a compactionMarker and auto continue the conversation
