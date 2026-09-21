# Security

## Reporting

Report privately through
[a security advisory](https://github.com/chr0nzz/omarchy-alienware-battery/security/advisories/new).
Never open a public issue for a vulnerability.

Expect a first reply within seven days.

## What this plugin can do

It runs unprivileged, inside the Omarchy shell, as your user. It has no helper, no daemon and no
socket of its own.

It reads:

- the battery through UPower on the session bus
- `omarchy-battery-status --shell`, for size, cycles and the charge limit
- `alienwarectl status`, for the thermal profile, when that helper is installed

It writes:

- `alienwarectl profile <name>`, when you pick a thermal profile
- its own settings in `~/.config/omarchy/shell.json`, through the shell

Changing a thermal profile is the only privileged action, and it goes through `alienwarectl`, which
does its own checks. This plugin never writes to sysfs, never talks to the hardware directly, and
never touches files outside the shell config.

## Supported versions

The latest release on `main`.
