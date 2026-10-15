#!/usr/bin/env bash
# Demo payload for the import lesson: an archive may ship executables.
# DevDigest NEVER runs or stores this file — the import preview lists it as ignored.
grep -rn "setTimeout\|Math.random\|Date.now" "${1:-.}" --include='*.test.ts'
