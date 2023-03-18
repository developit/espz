# espz

https://www.npmjs.com/package/espz

`espz` is a simple CLI for interacting with Espruino devices.

Both the REPL and flasher run your code through Babel to add modern syntax support with minimal overhead.

Flashed code is bundled and optimized via Rollup and Terser, so you can use ES Modules.

## Getting Started

In order to use this tool, you need to first flash Espruino onto your ESP8266:

1. Download the firmware files from [espruino.com/EspruinoESP8266](http://www.espruino.com/EspruinoESP8266#firmware-updates)

2. Plug in your device using a USB cable that supports data (it's ridiculous how many of them don't)

3. Flash the firmware according to [these instructions](http://www.espruino.com/ESP8266_Flashing). For example, if you're on MacOS:
    
     ```sh
    esptool.py --port /dev/tty.usbserial-* --baud 115200 write_flash --flash_freq 80m --flash_mode dio --flash_size 32m \
    0x0000 "boot_v1.6.bin" 0x1000 espruino_esp8266_user1.bin 0x3FC000 esp_init_data_default.bin 0x3FE000 blank.bin
    ```

4. You can now send code to the device or [access a REPL](#repl) using espz.

5. Once you've flashed code that [connects to your wifi network](https://github.com/developit/espz/blob/f3303ea279c9ed18cab313daca8e6e29076f359c/demo/homectrl/index.js#L97-L119), you can send code or launch the REPL over wifi via `--address HOSTNAME_OR_IP`.

## Usage

### REPL

The REPL is just like Espruino's REPL, except that it supports ES2017.

> **Note:** `Ctrl+C` sends a reset signal, which will destroy any currently-executing timers and event handlers.
> I'll probably change this at some point because it's rarely desirable.
> For now, just type `exit` and hit enter to leave the REPL without sending a reset.

```sh
# connect to a local device:
espz repl --address /dev/cu.usbserial*

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

## Example Application

`espz` includes ambient TypeScript definitions for Espruino's APIs and modules, which extend the official Espruino types with a bunch of things they're missing. The only thing that can be unclear from reading Espruino's docs and the TypeScript defintions is how best to initialize your code, since the technique varies depending on how you choose to flash (as boot code, versus executing the code immediately).

My recommendation is to flash to bootcode via `espz send --boot --tail --address x:x:x:x`, and use `E.on('init')` to initialize your application after a short delay:

```js
import Wifi from 'Wifi';

function start() {
	// put your startup logic in here.
	Wifi.connect('foo', { password: 'bar' }, (err) => {
		Wifi.save();
		// etc
	});
}

try {
	E.on('init', () => setTimeout(start, 1000));
} catch (e) {}
```

> **Side Note:** the `.on()` mixin used by Espruino's API's doesn't seem to support multiple event handlers like it would imply. Register stuff up-front and delegate in your code instead.
