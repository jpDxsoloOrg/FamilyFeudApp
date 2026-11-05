# Hosting a game

Everything you need to run a night of Family Feud. You need one laptop for the host console, a
TV or projector with a browser for the display, and each player's phone.

## Before the party

1. Open the site and tap **Host a new game**. You land on **Setup**. The browser you do this in
   now holds the *host token*; keep using it, or copy the token (**Copy host token**) to move
   hosting to another device.
2. **Settings**: how many rounds (default 4), the point multiplier per round (default 1, 1, 2, 3),
   strikes before a steal (3), and the Fast Money question count (5), timers (20 s and 25 s) and
   target (200).
3. **Survey questions**: one per round, up to 8 answers each with points. The board sorts them by
   points for you. Aim for answers that add up to about 100.
4. **Fast Money questions**: at least as many as the question count. Quick, one-word-answer
   questions work best ("Name a fruit").
5. **Question bank**: **Export JSON** to keep tonight's questions, **Import file…** to load a
   bank from a previous night or a CSV you wrote in a spreadsheet
   (`type,question,answer1,points1,answer2,points2,…`, type `survey` or `fastmoney`).
   **Save in this browser** keeps a bank for next time without a file.

## The lobby

1. Click **Host console**, then **Open display** and drag that window to the TV. The display
   shows the join code and a QR code.
2. Players open the site (or scan the code), enter the code and a name. They appear on the
   display as they arrive.
3. **Randomize teams** deals everyone onto two teams. Rename them, drag or arrow-reorder the
   turn order, move someone across, or **Remove** a player who has to leave (they can be
   restored later). **Re-draw teams** shuffles again.
4. Someone joins late? They appear under **Unassigned**; put them on a team and they go to the
   bottom of that team's order.

## A round

The console walks you through it; the display and phones follow automatically.

1. **Start round N**: pick a survey. The next contestant from each team is chosen for you
   (top to bottom, wrapping around). **Skip** a contestant who is not ready.
2. Read the question aloud (it is on your console; players cannot see it yet), then
   **Arm buzzers & show question**. The two contestants' phones become a big red BUZZ button.
3. Whoever buzzes first lights up. Listen to their answer and either click the matching board
   answer (or press **1–8**) or **Strike** (**X**). If they did not get the #1 answer, the other
   contestant answers next.
4. **X wins face-off**: pick the team that won it, then whether they **play** or **pass**.
5. Playing the board: the current guesser's phone says *You're up!*. Reveal or strike each
   answer. Three strikes hands a **steal** to the other team: one answer, reveal or strike.
6. When the pot is awarded, reveal the remaining answers (no points), then **End round**. The
   pot is added to the team's score.
7. Made a mistake? **Undo** (**Z**) reverts the last action in the round.

## Fast Money

1. After the last round the console suggests the leading team. Pick two players in order and
   **Confirm players**.
2. **Start** player 1. Only their phone shows the questions, one at a time, with **Submit** and
   **Skip** (skipped questions come back around). Player 2's phone says *Look away*. The
   display shows only the clock.
3. **End turn** when time is up, then **Start** player 2. Their answers appear next to player
   1's on your console as they type. A likely duplicate is flagged in red: click **Duplicate!**
   and their phone asks for a different answer.
4. **Reveal** each answer, choosing the board answer it matches (the closest one is
   preselected) or *Not on the board*. The total climbs on every screen; hitting the target
   shows the win.
5. **Finish game**.

## Team chat

Each team has a chat on their phones or computers for quick huddles during a face-off or steal. It is not
shown on the TV. The **Team chats** section at the bottom of the host console shows both teams'
chats side by side, read only, so you can follow along but not post. Messages vanish after 20 minutes.

## If something goes wrong

- **A phone lost the game**: reopening the site puts them straight back in the same seat.
- **The host laptop died**: on another device open the same `/host/<game>` link and paste the
  host token (you copied it, right?).
- **Sound**: each screen has its own mute toggle; browsers only play sound after a tap.
- **The display is behind**: it re-reads the game whenever it reconnects or the tab comes
  back, so a refresh is never worse than waiting.
