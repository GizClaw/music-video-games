# @gizclaw/mvg-core

Shared timing, canvas HUD, haivivi opening, three.js post-processing and brand
assets for music videos and games. Install the versioned npm tarball listed in
the GitHub Release's `npm-index.json`; Deploy publishes it to the TOS npm registry.

```js
import { Timing } from "@gizclaw/mvg-core/timing.js";
import { Hud } from "@gizclaw/mvg-core/hud.js";
import { deriveIntro } from "@gizclaw/mvg-core/intro.js";
import { FinalShader } from "@gizclaw/mvg-core/fx.js";
```

The SVG is available as `@gizclaw/mvg-core/assets/haivivi-wordmark.svg`. This
package expects the compatible `three` peer dependency declared in its own
`package.json`. Its version is independent of the release's UTC snapshot tag.
