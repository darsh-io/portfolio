# Projects

---

## AsciiCraft
**Tech:** Python, Flask, HTML, CSS, JavaScript

A web-based image-to-ASCII conversion tool. Built with Flask, Pillow, NumPy, and SciPy. Applies contrast, brightness, gamma correction, edge detection, and dithering enhancements. Supports multiple character sets with smart memory optimization and hybrid dithering to preserve visual detail. Exposes endpoints for image analysis, conversion, and ASCII text download.

---

## Comber (Game)
**Tech:** Unity, C#

A fast-paced 1v1 duel game with recharging abilities — dash, lift, shoot. Designed with a high skill ceiling but low skill floor: accessible but challenging. Features a heal station requiring precise platforming. Focused on character design, ability balancing, and gameplay polish.

---

## Wordl-assIST (Game Solver)
**Tech:** Python, CustomTkinter, Information Theory

A Wordle solver powered by information theory. Encodes game state into vectors, evaluates entropy-based probabilities, and iteratively narrows possible solutions. Custom Tkinter GUI displays best guesses, top suggestions, and game history.

---

## Hangman's Savior (Game Solver)
**Tech:** Python, CustomTkinter, Information Theory

A Hangman solver that determines optimal letter guesses using information theory. Evaluates letter probabilities in real time and updates guessing strategy dynamically. Custom Tkinter GUI for interactive gameplay.

---

## AI Chatbot
**Tech:** Cerebras API, HTML, CSS, JavaScript

A personalized chatbot that answers questions about you using stored context. Frontend in HTML/CSS/JS; backend calls the Cerebras API with contextual data per query. Includes prompt-engineering patterns for consistent output, plus UI safeguards and consent checks for privacy. Designed for portfolio site embedding.

---

## Turtle Master
**Tech:** Python, PIL, Turtle

Converts any image into fully functional Python Turtle code that recreates the image with a controllable number of lines. Analyzes pixel data, resizes as needed, and generates drawing instructions. Pushes Turtle — a basic educational library — to its practical limits.

---

## Ultimate Ciphex
**Tech:** Python, CustomTkinter, base64, unicodedata, pyperclip

Encrypts any text — including emojis and Unicode symbols — into fully ASCII-friendly output. Combines XOR, Base64, and two custom-designed algorithms with practically infinite key space. Custom Tkinter GUI for a polished UX. Fully reversible decryption.

---

## MC Stronghold Finder
**Tech:** Python, Math

Calculates the nearest Minecraft stronghold using just two Eyes of Ender throws. Applies the Law of Sines to triangulate exact coordinates from two observed angles. Turns a tedious in-game task into a fast, precise tool.

---

## Rubik's Cube Solver — Lego 51515
**Tech:** LEGO 51515, MicroPython

A robotic Rubik's Cube solver. Scans each tile, computes required moves via a proven algorithm, and executes them mechanically. Uses a basket-like container for yaw rotation and a grabber to manipulate the top layer for roll. Combines robotics, algorithm implementation, and embedded control.

---

## Voice Calculator
**Tech:** Google Translate (STT/TTS), App Inventor

A voice-controlled calculator that listens to spoken arithmetic and responds verbally. Uses Google Translate for speech-to-text input, performs the calculation, and text-to-speech for output. Built in App Inventor; handles single-operation math questions in real time.

---

## DARSHBOT — Tic Tac Toe
**Tech:** Python, PyTorch, Pygame

A Tic Tac Toe AI using a neural network trained with Q-tables. Encodes board positions as vectors, processes through the network, and updates in real time. No hardcoded rules — the AI learns and adapts entirely through reinforcement learning.

---

## Valorant Stat Puller
**Tech:** Python, HenrikAPI

Pulls a player's recent Valorant match stats — detailed data from the last five games. Uses Python's requests library to fetch real-time data from HenrikAPI, parses responses, and formats them into structured, readable output.

---

## Minecraft Server Hosting
**Tech:** Networking, Tunneling (Playit.gg)

A Minecraft server hosted for a class, supporting ~5 players average and up to 20. Uses Playit.gg's free tunneling to safely expose the server without port forwarding. Automated start/stop with batch scripts. Handled debugging, player management, and network troubleshooting as server admin.

---

## Writer — Lego 51515
**Tech:** LEGO 51515, MicroPython

A LEGO text-writing robot that converts input text into mechanical handwriting on paper. Uses preprogrammed letter motions, forward movement for X-axis, and an oscillating mechanism for Y-axis. Combines coordinate-based motion planning, motor control, and algorithmic letter mapping.

---

## Maze Generator (Game)
**Tech:** Scratch

A procedurally generated, playable maze in Scratch. At each step the program randomly decides to turn, places a tile, and backtracks on collision — producing a fully connected, navigable maze. Demonstrates procedural content generation in a visual programming environment.

---

## Prank Batch & VBS
**Tech:** Batch, VBS

A toolkit of VBS and Batch scripts automating keyboard input and system behaviors. Features simulated keypress sequences, recursive command flows, and controlled screen-lock triggers. Uses Windows Script Host, SendKeys-style input emulation, and process recursion — a low-level dive into OS automation and input injection.

---

## Leaderboard
**Tech:** Python, Pygame, JSON

A Pygame leaderboard built for a school science fair to track hovercraft race times. Players enter name and score; the program sorts and displays results in a clean UI. Uses JSON for persistent data storage and dynamic sorting.

---

## DARSHBOT — Othello
**Tech:** Python, PyTorch, Pygame

An Othello AI using a neural network to evaluate and play moves. Encodes board positions as vectors, feeds through the network, and updates game state in real time. Full reinforcement learning pipeline — evaluates game states, predicts optimal moves, and adapts strategies dynamically.

---

## ESP32 Tank
**Tech:** Python, Sockets, ESP32, Pygame

An ESP32 tank controller with a procedurally generated tile-based floor and a detailed tank sprite. Key inputs (move, shoot, defensive strafe) are sent via sockets to a receiver that updates movement in real time. Includes a fast-strafe defensive mechanic and an "inactive signal jammer" tactical twist. Spans embedded systems, networked control, procedural visuals, and game polish.

---

## Coin Maniac
**Tech:** HTML, CSS, JavaScript

A fast-paced browser game where players collect coins while dodging obstacles. Tracks high scores, displays dynamic updates, and features responsive controls. Built purely with frontend web tech — DOM manipulation and real-time game logic with no frameworks.

---

## Domain Acquisition
**Tech:** Cloudflare Registrar, Cloudflare Dashboard

Purchased and configured a personal domain end-to-end through Cloudflare. Manually set up DNS records (A, CNAME, MX), debugged propagation delays and cached negative lookups, and configured SMTP for transactional email. Heavy documentation reading, DNS tooling, and TTL management — foundational infrastructure work.

---

## GIS (Graphed Image System)
**Tech:** Python, Pillow

An experimental image compression system encoding images as geometric boundary data rather than raw pixels. Pipeline: posterize to a compact palette → segment into uniform color regions → trace boundaries as contours → serialize to a custom binary `.gis` format compressed with LZMA. Outputs PSNR and file-size comparisons vs PNG and JPEG. Performs best on flat-region, clean-boundary illustration-style images.

---

## Portable PC Stats
**Tech:** ESP32, C++, Python, SPI, Serial

Streams live PC stats — CPU/GPU temperature, load, RAM usage — to a 128×64 OLED driven by an ESP32-S3. A Python script pulls data from LibreHardwareMonitor and pipes it over serial; the microcontroller parses and renders on-device. Covers every layer: host-side extraction, serial protocol design, firmware parsing, and display rendering.

---

## OpenClaw
**Tech:** Linux, OpenClaw, Raspberry Pi 4

Got OpenClaw running on a Raspberry Pi 4 with live web browsing. Practical finding: current local AI agents fail badly under deadline pressure — assigned tasks with specific times were consistently missed, sometimes with a delayed acknowledgment and no follow-through. A hands-on lesson in where agentic systems actually break down in real use.

---

## 67speed Score Spoofer
**Tech:** Python, mitmproxy, JSON

A proof-of-concept exploit against 67speed.com, a hand-motion speed game with a public leaderboard. Intercepts outgoing score submissions via mitmproxy, rewrites the payload to 1000 (ceiling before server-side flagging). No client modification — purely network-layer. Demonstrates why leaderboard integrity requires server-authoritative scoring.

---

## PolyTrack Time Spoofer
**Tech:** Python, mitmproxy, JSON

Intercepts and rewrites time-submission payloads in PolyTrack (a Trackmania-style racing game) to near-zero values, pushing runs to first on public leaderboards. Spoofed scores held ~15 hours before anticheat flagged them — revealing deferred integrity checks. A case study in the gap between real-time leaderboard trust and asynchronous server-side validation.

---

## Deadaimbot.io
**Tech:** Python, OpenCV, ctypes

A computer vision aimbot for Deadshot.io (browser-based FPS). Uses screen capture and OpenCV to detect enemy health bars in real time, then repositions the cursor slightly below each bar to align with the head hitbox — exploiting the consistent UI-to-model offset. No memory reading or game client modification; purely vision-based from screen pixels.

---

## Osu!Mania Bot
**Tech:** Python, mss, PyAutoGUI

A lane-reading bot for osu!mania. Samples fixed pixel coordinates on each of the four note lanes at high poll rate; when a lane's pixel deviates from its inactive color, the corresponding key is injected. No ML or image recognition — pure color-threshold detection for minimal latency. Exploits the game's fixed lane geometry and consistent note rendering.

---

## JKLM BombBot
**Tech:** Python, PyAutoGUI, pyperclip

Automates JKLM BombParty — a multiplayer word game where players enter words containing a given syllable under a countdown. Bot clicks the input field, copies the syllable via clipboard, queries a preloaded word list, and types a match. Prioritizes words with rare/unused letters to trigger the extra-life mechanic. Practical exercise in input automation and greedy strategy optimization.

---

## RetroDoom
**Tech:** MicroPython, SPI, RP2040

A Wolfenstein-style 3D raycaster on a RetroPy console (RP2040 + 320×240 screen, 264KB RAM). Features a full raycasting engine, maze levels, enemies, guns with recoil, keys, and exits. Every optimization was aggressive: integer math over floats, precomputed lookup tables, minimal overdraw. Getting real-time 3D rendering in MicroPython on constrained hardware required rethinking fundamental engine assumptions.