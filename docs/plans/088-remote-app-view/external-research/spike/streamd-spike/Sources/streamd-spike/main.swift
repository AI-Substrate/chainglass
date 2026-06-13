// streamd-spike — Plan 088 Phase 1 de-risk scratch (throwaway evidence code).
import Foundation

let args = Array(CommandLine.arguments.dropFirst())

func flagValue(_ name: String) -> String? {
    guard let i = args.firstIndex(of: name), i + 1 < args.count else { return nil }
    return args[i + 1]
}

func hasFlag(_ name: String) -> Bool { args.contains(name) }

func fail(_ msg: String) -> Never {
    FileHandle.standardError.write(("error: " + msg + "\n").data(using: .utf8)!)
    exit(1)
}

// Bundle-launched runs (`open -g … --args`) lose stdout — redirect to a file.
if let logPath = flagValue("--log") {
    freopen(logPath, "a", stdout)
    freopen(logPath, "a", stderr)
}

guard let cmd = args.first else {
    print("""
    streamd-spike — Plan 088 Phase 1 de-risk scratch

    subcommands:
      preflight [--request]                  print (and optionally request) Screen Recording + Accessibility grants
      list                                   list shareable windows (app, title, id, frame)
      capture   --app S|--title S|--window-id N [--duration N=60] [--stills-every N=10] [--out DIR] [--label S]
      encode    --app S|--title S|--window-id N [--duration N=8] [--bitrate N=3000000] [--out DIR]
      synth     [--width N=640] [--height N=480] [--fps N=30] [--duration N=4] [--out DIR]   (no TCC grant needed)
      inject    --app S|--title S|--window-id N [--actions click,drag,scroll,type] [--text S] [--dx N --dy N]
      windowid  --app S|--title S  |  --check N
    """)
    exit(0)
}

switch cmd {
case "preflight": runPreflight()
case "list": runList()
case "capture": runCapture()
case "encode": runEncode()
case "synth": runSynth()
case "inject": runInject()
case "windowid": runWindowID()
default: fail("unknown subcommand \(cmd)")
}
