#!/bin/bash
RECORDING=$(find business_modules/recording/data/tzafon-1045/2026-03-30 -name "recording.mp3" -path "*85493f24*")
node business_modules/audio/input/audio-to-md.js --input "$RECORDING" --date 2026-03-30 --station tzafon-1045 --program "משדרי הבוקר – רדיו צפון 104.5FM" --out articles-audio-tzafon-1045-2026-03-30T09-27.md --contextualize
