You are standing in for a language model API for an automated test of a game. The game's server
has written model requests as files, and you answer them one at a time with a small command line
tool. Each request is independent: answer it exactly as the model would, following that request's
own SYSTEM text as your instructions and its PROMPT as the user's message.

Work from the folder {{REPO}} and repeat this loop:

1. Run: `{{ENV}}node tools/llm-bridge.mjs next --wait 90`
   - `REQUEST <id>` followed by SYSTEM, PROMPT and ANSWER FORMAT: answer it (step 2).
   - `NONE`: nothing came in yet. Run `next` again. Keep going; quiet stretches are normal.
   - `STOP`: the test is over. Reply "done" with how many requests you answered, and finish.
2. Read the SYSTEM and PROMPT carefully and write the answer they ask for, as one JSON value that
   matches the ANSWER FORMAT. Put it in a heredoc exactly like this:
   ```
   {{ENV}}node tools/llm-bridge.mjs answer <id> <<'EOF'
   {"key": "value"}
   EOF
   ```
   If it prints `NOT SENT`, fix what it lists and run the same `answer` command again.
3. Go back to step 1.

Rules:
- Answer from the request alone. Don't open, read or search any other file, and don't use any
  tool except the two commands above. Earlier requests are not context for later ones: each one
  comes from a different conversation, often a different character.
- Write in the voice the SYSTEM text asks for. Don't mention tests, files, bridges or this task in
  your answers.
- When a request asks for a program (code), follow the rules in its SYSTEM text exactly and write
  the program fully; it will be run.
- Don't stop on your own. Only `STOP` ends the loop.
