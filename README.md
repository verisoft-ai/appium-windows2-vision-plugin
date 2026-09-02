# appium-wincore-vision-plugin

Vision-based element finding for [appium-desktop-driver](https://github.com/verisoft-ai/appium-desktop-driver), as an installable Appium plugin.

Adds the `windows: findByVision` execute-script command: sends a screenshot and a natural-language description to a vision-capable LLM (Claude, GPT, Gemini, or Amazon Nova via Bedrock), then maps the model's answer back to screen coordinates.

Split out from the driver core so users who don't need LLM-based vision finding — and the dependencies it pulls in (`@techstark/opencv-js`, `@napi-rs/canvas`, provider SDKs) — don't have to install them.

## Install

```bash
appium plugin install --source=npm appium-wincore-vision-plugin
```

Requires Appium 3 and `appium-desktop-driver` installed and running a `DesktopDriver` session.

## Enable

```bash
appium --use-plugins=wincore-vision
```

## Usage

```js
const result = await driver.executeScript('windows: findByVision', [{
  prompt: 'the Submit button',
  model: 'claude-sonnet-4-5',
  includeAnnotatedImage: false,
}]);
// { x, y, label, steps, annotatedImageBase64? }
```

| Param | Required | Description |
|---|---|---|
| `prompt` | yes | Natural-language description of the element to locate |
| `model` | yes | Vision model id — `claude-*`, `gpt-*`/`o*`, `gemini-*`, or `*.amazon.nova-*` |
| `includeAnnotatedImage` | no | Include a base64 annotated screenshot in the result |

## API keys

Set the environment variable matching the model's provider before starting Appium:

| Model prefix | Env var |
|---|---|
| `claude-*` | `ANTHROPIC_API_KEY` |
| `gpt-*` / `o*` | `OPENAI_API_KEY` |
| `gemini-*` | `GEMINI_API_KEY` |
| `*.amazon.nova-*` | `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` |

## Development

```bash
npm install
npm run build
npm run test
npm run lint
```

## License

Apache-2.0
