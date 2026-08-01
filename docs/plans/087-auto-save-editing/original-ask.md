# Original ask — auto-save-editing
**Captured**: 2026-06-07T23:43:21Z  ·  **By**: /the-flow

> next new feature is auto save in editing files (both in rich mode and preview mode). it will auto save at regular intervals to a temp location. upon save it does the atomic file update cp or what ever and removes teh temp file. On loading a file if temp file exists, chances are that the temp file was never saved properly. On load, it wil ask if you want to restore the autosave, but that will just laod that verion in to editor, wont update target until save.
