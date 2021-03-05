# espz

`espz` is a simple CLI for interacting with Espruino devices.

Both the REPL and flasher run your code through Babel to add modern syntax support with minimal overhead.

Flashed code is bundled and optimized via Rollup and Terser, so you can use ES Modules.

### REPL

The REPL is just like Espruino's REPL, except that it supports ES2017.

> **Note:** `Ctrl+C` sends a reset signal, which will destroy any currently-executing timers and event handlers.
> I'll probably change this at some point because it's rarely desirable.
> For now, just type `exit` and hit enter to leave the REPL without sending a reset.

```sh
# connect to a local device:
espz repl --address /dev/cu.usbserial1234

# connect to an ESP8266 over TCP:
espz repl --address 192.168.55.200
```

### Compile and execute code on device

There are two options here: run the code immediately, or flash the code to `.bootcde` so that it runs on boot. Personally I find the latter more useful and reliable.

**Compile a module and run it on the device:**

```sh
espz send --address 192.168.55.200 src/index.js
```

**Compile a module and flash it as the device's boot code, then restart:**

```sh
espz send --boot --address 192.168.55.200 src/index.js

# you can also re-connect to the REPL after rebooting:
espz send --boot --tail --address 192.168.55.200 src/index.js
```

### Compile code for your device to a local file on disk

I'm not sure why you'd ever use this, but if you want to compile code based on a connected device and then store it on your computer rather than flashing it:

```sh
espz build --address 192.168.55.200 src/index.js --out out.js
```

### Writing files to the device's flash storage

This is the manual way to add files, not usually important.

```sh
espz write --address 192.168.55.200 index.html favicon.ico
```

## CLI Usage

```sh
Usage
$ espz <command> [options]

Available Commands
build    Compile modern JS modules for espruino
send     Compile and send modules to espruino
info     Print device information
repl     Start Espruino REPL for the device
write    Write file to device storage

For more info, run any command with the `--help` flag
$ espz build --help
$ espz send --help

Options
--address        TCP host to connect to (espruino.local:23)  (default espruino.local:23)
-v, --version    Displays current version
-h, --help       Displays this message
```
