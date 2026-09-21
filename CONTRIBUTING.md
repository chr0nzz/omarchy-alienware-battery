# Contributing

Thanks for looking. This is a small plugin: a bar icon, a popup, and one JavaScript model.

## Getting set up

```
git clone https://github.com/chr0nzz/omarchy-alienware-battery.git ~/.config/omarchy/plugins/xyzlab.alienware-battery
omarchy restart shell
```

The plugin directory has to be a real directory. The shell's watcher does not follow symlinks.

An edited QML file keeps running until the shell restarts, so run `omarchy restart shell` after
every change, even though the log says the plugin reloaded.

## Before a pull request

```
npm test
qmllint -I /usr/share/omarchy/shell -I . *.qml
```

Then open the popup in a running shell and check the change by hand, on battery and on mains.

## House rules

- No code comments, in any language. Name things so they explain themselves.
- No em dashes.
- Commit messages are a single line.
- Logic that can be tested lives in `Model.js` with a test beside it. QML stays declarative.
- Nothing blocks the shell. Readings come from UPower or a short-lived process.
- The widget works without the Alienware plugin and without `alienwarectl`. Thermal profiles are
  an extra, never a requirement.
