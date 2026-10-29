// Feature search: every control, section and command in the editor, found
// by its name, by words people use for it, or by a near miss of either
// ("confetti" finds Win particles, "fly to score" finds Winning symbols,
// "shak" finds Screen shake). Pure: the editor supplies the navigation.

// Words that mean the same thing here. A query word matching any word of a
// group also matches the others.
export const SYNONYMS = [
  ['particles', 'particle', 'confetti', 'explosion', 'explosions', 'burst', 'fireworks', 'sparkle', 'sparkles', 'shower', 'fountain', 'rain', 'emitter', 'vfx'],
  ['jump', 'fly', 'flies', 'flying', 'collect', 'score', 'meter', 'counter', 'land', 'landing', 'target', 'destination', 'position', 'travel', 'move'],
  ['merge', 'magnet', 'magnetize', 'magnetise', 'combine', 'fuse', 'join', 'gather', 'pull', 'attract', 'unite'],
  ['symbol', 'symbols', 'icon', 'icons', 'item', 'items', 'tile', 'tiles', 'art', 'image', 'images', 'picture', 'sprite', 'png', 'graphic'],
  ['speed', 'fast', 'slow', 'duration', 'length', 'time', 'timing', 'tempo', 'quick', 'long', 'short', 'seconds'],
  ['shake', 'vibrate', 'vibration', 'rumble', 'camera', 'wobble', 'tremble', 'quake'],
  ['flash', 'flashes', 'blink', 'strobe'],
  ['glow', 'bloom', 'shine', 'halo', 'light', 'lights', 'rays', 'beam'],
  ['sound', 'sounds', 'audio', 'sfx', 'music', 'volume', 'mute', 'noise', 'loud', 'quiet'],
  ['export', 'after', 'effects', 'ae', 'aep', 'jsx', 'package', 'project'],
  ['video', 'mp4', 'movie', 'clip', 'render', 'preview'],
  ['save', 'store', 'keep', 'backup', 'download'],
  ['open', 'load', 'import'],
  ['new', 'blank', 'fresh', 'empty', 'scratch'],
  ['reset', 'restore', 'default', 'defaults', 'demo', 'over'],
  ['clear', 'delete', 'remove', 'wipe', 'erase'],
  ['undo', 'revert', 'oops', 'back'],
  ['redo', 'again', 'forward'],
  ['reel', 'reels', 'column', 'columns', 'strip', 'strips'],
  ['row', 'rows', 'height', 'tall'],
  ['win', 'wins', 'winning', 'payout', 'prize', 'reward', 'amount', 'payline win'],
  ['tier', 'tiers', 'big', 'mega', 'epic', 'huge', 'jackpot', 'title', 'titles'],
  ['free', 'freespins', 'fs', 'spins'],
  ['hold', 'respin', 'respins', 'coin', 'coins', 'link', 'lightning', 'cash', 'grand'],
  ['wheel', 'fortune', 'segment', 'segments', 'pointer', 'ticker', 'flapper'],
  ['anticipation', 'tease', 'suspense', 'nearmiss', 'near', 'almost', 'miss'],
  ['payline', 'paylines', 'line', 'lines', 'ways', 'cluster', 'anywhere', 'pays'],
  ['background', 'bg', 'backdrop', 'scene', 'wallpaper'],
  ['logo', 'brand', 'name', 'heading'],
  ['frame', 'border', 'machine', 'cabinet', 'bezel', 'marquee', 'bulbs'],
  ['font', 'typeface', 'text', 'typography', 'letters', 'words'],
  ['color', 'colour', 'colors', 'colours', 'palette', 'theme', 'tint', 'style', 'look'],
  ['wild', 'wilds', 'joker', 'substitute', 'sticky', 'expanding', 'expand'],
  ['scatter', 'scatters', 'trigger', 'triggers'],
  ['multiplier', 'multipliers', 'mult', 'bomb', 'bombs', 'x2', 'times'],
  ['tumble', 'tumbles', 'cascade', 'avalanche', 'drop', 'drops', 'refill', 'chain'],
  ['transparent', 'transparency', 'alpha', 'prores', 'greenscreen', 'cutout'],
  ['format', 'formats', 'size', 'resolution', 'canvas', 'aspect', 'portrait', 'landscape', 'square', '4k', 'vertical', 'horizontal'],
  ['fps', 'framerate', 'frames'],
  ['bet', 'currency', 'money', 'decimals', 'dollar', 'euro', 'cents'],
  ['order', 'sequence', 'stagger', 'delay', 'delays'],
  ['motion', 'curve', 'ease', 'easing', 'bounce', 'overshoot', 'elastic', 'windup', 'graph'],
  ['blur', 'smear', 'streak'],
  ['dim', 'darken', 'darker', 'shade'],
  ['pop', 'scale', 'pulse', 'grow', 'bigger'],
  ['asset', 'assets', 'bank', 'library', 'upload', 'uploads', 'files'],
  ['search', 'find', 'help', 'shortcuts', 'keys', 'hotkeys', 'keyboard'],
  ['round', 'rounds', 'spin', 'outcome', 'result'],
  ['random', 'seed', 'reroll', 'shuffle', 'luck'],
  ['zoom', 'camera', 'closeup', 'close up', 'push', 'focus', 'magnify', 'enlarge', 'dolly'],
  ['continuous', 'continually', 'continuously', 'constant', 'always', 'loop', 'loops', 'looping', 'forever', 'endless', 'nonstop', 'ambient', 'persistent'],
  ['once', 'together', 'simultaneous', 'simultaneously', 'one by one', 'sequential', 'sequence', 'each', 'staggered', 'stagger'],
  ['off', 'hide', 'hidden', 'disable', 'disabled', 'toggle', 'show', 'visible', 'turn'],
  ['path', 'paths', 'trajectory', 'arc', 'curve', 'straight', 'linear', 'direct', 'route', 'windup', 'wind up'],
];

const T = (title, where, keys, go, when) => ({ title, where, keys, go, when });

// The index. go: { tab, id } a control in a settings tab, { tab, section }
// a whole section, { bank, id } the Asset Bank, { round: [outcomes], id }
// the round inspector, { top } a top bar control, { action } a command.
// when: why a control may not be on screen yet.
// Shown when a pots option is searched while the pots are off.
const POTS_OFF = 'Turn on Pots above the machine first; its options show then.';

export const FEATURES = [
  // project and app
  T('New project', 'Project menu', 'start fresh blank empty', { action: 'new' }),
  T('Open project file', 'Project menu', 'load import json', { action: 'open' }),
  T('Save project file', 'Project menu', 'download json keep backup', { action: 'save' }),
  T('Start from a preset', 'Presets button (top bar)', 'template templates example examples demo starter sample gallery ready made classic fruit ways candy clusters cells portrait free spins tease ladder coin rush wheel', { action: 'presets' }),
  T('Clear all rounds', 'Project menu', 'delete remove rounds sequence empty', { action: 'clear' }),
  T('Reset to the demo project', 'Project menu', 'restore default start over', { action: 'reset' }),
  T('Undo', 'Top bar', 'revert back', { action: 'undo' }),
  T('Redo', 'Top bar', 'again forward', { action: 'redo' }),
  T('Keyboard shortcuts', 'Help', 'keys hotkeys help', { action: 'keys' }),
  T('Asset Bank', 'Top bar', 'assets library upload images symbols art window', { action: 'bank' }),
  T('Resize the side panels', 'Layout', 'width wider narrower drag divider splitter panel', { action: 'splitters' }),
  // transport
  T('Play / pause', 'Transport', 'play stop start preview', { top: 'tp-play' }),
  T('Loop the preview', 'Transport', 'repeat loop', { top: 'tp-loop' }),
  T('Solo round', 'Transport', 'only this round isolate', { top: 'tp-solo' }),
  T('Preview sound on or off', 'Transport', 'mute audio sound', { top: 'tp-sound' }),
  T('Playback speed', 'Transport', 'slow motion half quarter speed', { top: 'tp-speed' }),
  // Machine
  T('Game type', 'Machine › Game', 'slot hold spin wheel only mode', { tab: 'machine', id: 'm-game' }),
  T('Project name', 'Export › Output', 'title name', { tab: 'export', id: 'm-name' }),
  T('Canvas size', 'Export › Output', 'format resolution portrait landscape square 4k', { tab: 'export', id: 'm-format' }),
  T('Frame rate', 'Export › Output', 'fps', { tab: 'export', id: 'm-fps' }),
  T('Number of reels', 'Machine › Reels', 'columns width', { tab: 'machine', id: 'm-reels' }),
  T('Number of rows', 'Machine › Reels', 'height', { tab: 'machine', id: 'm-rows' }),
  T('Cell height', 'Machine › Reels', 'aspect tall', { tab: 'machine', id: 'm-aspect' }),
  T('Partial symbols above and below', 'Machine › Reels', 'peek', { tab: 'machine', id: 'm-peek' }),
  T('Reel curvature', 'Machine › Reels', 'curve cylinder 3d bend', { tab: 'machine', id: 'm-curve' }),
  T('Pay mode', 'Machine › How it pays', 'paylines ways anywhere cluster', { tab: 'machine', id: 'm-pay' }),
  T('Paylines', 'Machine › How it pays', 'lines count', { tab: 'machine', id: 'm-lines' }, 'Shown when the pay mode is Paylines.'),
  T('Scatters to trigger a feature', 'Machine › How it pays', 'scatter count', { tab: 'machine', id: 'm-scatter' }),
  T('Hold & Spin settings', 'Features › Hold & Spin', 'respins grand coins counter', { tab: 'features', section: 'hold-spin' }, 'Shown for the Slot and Hold & Spin games.'),
  T('Respins counter', 'Features › Hold & Spin', 'respins how many lives', { tab: 'features', id: 'm-hs-respins' }, 'Shown for the Slot and Hold & Spin games.'),
  T('Grand prize when the board fills', 'Features › Hold & Spin', 'grand jackpot full board', { tab: 'features', id: 'm-hs-grand' }, 'Shown for the Slot and Hold & Spin games.'),
  T('Theme', 'Machine › Look', 'colour palette style', { tab: 'machine', id: 'm-theme' }),
  T('Marquee bulbs', 'Machine › Look', 'lights frame bulbs', { tab: 'machine', id: 'm-marquee' }),
  T('Win meter under the reels', 'Machine › Look', 'hud counter meter', { tab: 'machine', id: 'm-hud' }),
  T('Pots above the machine', 'Features › Pots', 'pots pot of gold gems fruits cauldron elements orbs above the reels top band booster collect', { tab: 'features', id: 'm-pots', section: 'pots-above-the-machine' }),
  T('Room above the machine for the pots', 'Features › Pots', 'height band space top scale machine down', { tab: 'features', id: 'm-pots-band', section: 'pots-above-the-machine' }, POTS_OFF),
  T('Pot size and spacing', 'Features › Pots', 'bigger closer together apart gap', { tab: 'features', id: 'm-pots-size', section: 'pots-above-the-machine' }, POTS_OFF),
  T('Pot art and colour', 'Features › Pots', 'upload pot image gold gems fruit colour', { tab: 'features', id: 'm-pot-art-0', section: 'pots-above-the-machine' }, POTS_OFF),
  T('What a pot does: collect, upgrade or both', 'Features › Pots', 'pot role collect collects upgrade upgrades both only', { tab: 'features', id: 'm-pot-role-0', section: 'pots-above-the-machine' }, POTS_OFF),
  T('Winners beam up into the pots', 'Features › Pots', 'collect into pots beam winners pots collect win', { tab: 'features', id: 'm-pots-collect', section: 'pots-above-the-machine' }, POTS_OFF),
  T('Pots by symbol', 'Features › Pots', 'by type symbol assign pot each symbol tiles icons which pot gems fruits gold', { tab: 'features', id: 'm-pots-aim', section: 'pots-above-the-machine' }, POTS_OFF),
  T('Beam curve', 'Features › Pots › Beams', 'saber laser beam arc s curve bend whip', { tab: 'features', id: 'm-beam-curve', section: 'pots-above-the-machine' }, POTS_OFF),
  T('Beam thickness and timing', 'Features › Pots › Beams', 'saber laser beam width travel speed', { tab: 'features', id: 'm-beam-width', section: 'pots-above-the-machine' }, POTS_OFF),
  T('Bet', 'Machine › Money', 'stake money', { tab: 'machine', id: 'm-bet' }),
  T('Currency', 'Machine › Money', 'dollar euro symbol money', { tab: 'machine', id: 'm-cur' }),
  T('Decimals', 'Machine › Money', 'cents money', { tab: 'machine', id: 'm-dec' }),
  T('Random seed', 'Machine › Randomness', 'random shuffle seed', { tab: 'machine', section: 'randomness' }),
  // Spin
  T('Spin type', 'Spin', 'classic staggered turbo tease cascade per cell', { tab: 'spin', section: 'spin-type' }),
  T('Spin direction', 'Spin › Reel order', 'down up', { tab: 'spin', id: 'spin-dir' }),
  T('Reel start order', 'Spin › Reel order', 'sequence left to right', { tab: 'spin', id: 'spin-start-order' }),
  T('Reel stop order', 'Spin › Reel order', 'sequence right to left centre', { tab: 'spin', id: 'spin-stop-order' }),
  T('Motion curve graph', 'Spin › Motion curve', 'graph ease keyframes', { tab: 'spin', section: 'motion-curve' }),
  T('Start style', 'Spin › Start', 'wind up ease instant', { tab: 'spin', id: 'spin-start' }),
  T('Wind-up pull back', 'Spin › Start', 'windup', { tab: 'spin', id: 'spin-windup' }),
  T('Spin length', 'Spin › Mid', 'duration time long', { tab: 'spin', id: 'spin-mid' }),
  T('Top speed', 'Spin › Mid', 'fast speed', { tab: 'spin', id: 'spin-speed' }),
  T('Motion blur', 'Spin › Mid', 'blur smear', { tab: 'spin', id: 'spin-blur' }),
  T('Stop style', 'Spin › End', 'bounce elastic hard soft', { tab: 'spin', id: 'spin-end' }),
  T('Overshoot', 'Spin › End', 'bounce', { tab: 'spin', id: 'spin-over' }),
  T('Start stagger', 'Spin › Reel timing', 'delay', { tab: 'spin', id: 'spin-ss' }),
  T('Stop stagger', 'Spin › Reel timing', 'delay', { tab: 'spin', id: 'spin-st' }),
  T('Anticipation extra time', 'Spin › Anticipation', 'tease suspense slow', { tab: 'spin', id: 'spin-ant' }),
  T('Anticipation crawl speed', 'Spin › Anticipation', 'tease slow', { tab: 'spin', id: 'spin-ant-v' }),
  T('Gap between rounds', 'Spin › Between rounds', 'pause wait', { tab: 'spin', id: 'tm-gap' }),
  T('Intro and outro hold', 'Spin › Between rounds', 'start end pause', { tab: 'spin', id: 'tm-intro' }),
  // Wins
  T('Big win tiers', 'Wins › Win tiers', 'big mega epic titles thresholds', { tab: 'wins', section: 'win-tiers' }),
  T('Winning symbols style', 'Wins › Winning symbols', 'pop jump merge fly score magnet', { tab: 'wins', id: 'wf-style' }),
  T('Winning symbols jump into the score', 'Wins › Winning symbols', 'fly collect meter counter travel', { tab: 'wins', id: 'wf-style' }),
  T('Where winning symbols land', 'Wins › Winning symbols', 'landing spot target position destination meter custom', { tab: 'wins', id: 'wf-target' }, 'Shown when Winning symbols is set to Jump into the score.'),
  T('Pick the landing spot on the preview', 'Wins › Winning symbols', 'click position place target custom', { tab: 'wins', id: 'wf-pick-jump' }, 'Shown when Jump into the score lands on a custom position.'),
  T('Winning symbols merge into one big symbol', 'Wins › Winning symbols', 'magnet magnetize combine fuse middle', { tab: 'wins', id: 'wf-style' }),
  T('Merge point', 'Wins › Winning symbols', 'middle centre position custom', { tab: 'wins', id: 'wf-point' }, 'Shown when Winning symbols is set to Magnet merge.'),
  T('Big merged symbol size', 'Wins › Winning symbols', 'scale size', { tab: 'wins', id: 'wf-big' }, 'Shown when Winning symbols is set to Magnet merge.'),
  T('Winning symbol pop', 'Wins › Winning symbols', 'scale bounce pulse', { tab: 'wins', id: 'fx-pop' }),
  T('Dim other symbols', 'Wins › Winning symbols', 'darken losing', { tab: 'wins', id: 'fx-dim' }),
  T('Win particles', 'Effects › Win particles', 'confetti coins fountain fireworks explosion', { tab: 'effects', section: 'win-particles' }),
  T('Particle amount', 'Effects › Win particles', 'count density how many', { tab: 'effects', id: 'fx-coins' }),
  T('Particles that keep going', 'Effects › Win particles', 'continuous continually always loop looping forever until the next round to the end length how long nonstop', { tab: 'effects', section: 'win-particles' }, 'Pick a continuous explosion (fountain, rain, fireworks…), then set how long it runs in the select next to it.'),
  T('Ambient particles', 'Effects › Win particles', 'always behind background floating loop continuous whole animation', { tab: 'effects', id: 'pfx-ambient-fx' }),
  T('Merge all at once or one by one', 'Wins › Winning symbols', 'together one by one each sequence staggered simultaneous slider', { tab: 'wins', id: 'wf-seq' }, 'Shown when Winning symbols is set to Magnet merge.'),
  T('Jump flight path', 'Wins › Winning symbols', 'arc straight linear wind-up windup back anticipation trajectory curve motion', { tab: 'wins', id: 'wf-jpath' }, 'Shown when Winning symbols is set to Jump into the score.'),
  T('Merge flight path', 'Wins › Winning symbols', 'arc straight linear wind-up windup back anticipation trajectory curve motion', { tab: 'wins', id: 'wf-mpath' }, 'Shown when Winning symbols is set to Magnet merge.'),
  T('Draw the winning lines', 'Wins › Winning symbols', 'paylines payline hide show off turn off disable drawing', { tab: 'wins', id: 'fx-lines-on' }),
  T('Zoom in on the anticipation reel', 'Spin › Anticipation', 'camera push in close up closeup focus tease', { tab: 'spin', id: 'spin-zoom-on' }),
  T('Anticipation zoom amount', 'Spin › Anticipation', 'camera how much close', { tab: 'spin', id: 'spin-zoom' }, 'Shown when the anticipation zoom is on.'),
  T('Explosion templates', 'Effects › Explosion templates', 'burst cannons popper rain spiral shimmer gallery', { tab: 'effects', section: 'explosion-templates' }),
  T('Display font', 'Effects › Titles and font', 'typeface typography', { tab: 'effects', id: 'fx-font' }),
  T('Feature titles', 'Effects › Titles and font', 'free spins bonus wheel near miss grand text words', { tab: 'effects', section: 'titles-and-font' }),
  T('Win timing', 'Wins › Win timing', 'show duration count up hold', { tab: 'wins', section: 'win-timing' }),
  T('Count-up per tier', 'Wins › Win timing', 'counter duration', { tab: 'wins', id: 'tm-tier' }),
  T('Tumble timing', 'Wins › Win timing', 'pop fall cascade', { tab: 'wins', id: 'tm-tshow' }),
  T('Multiplier collect timing', 'Wins › Win timing', 'multipliers fly total each', { tab: 'wins', id: 'tm-mult' }),
  // Effects
  T('Payline glow', 'Effects › Intensity', 'line glow', { tab: 'effects', id: 'fx-line' }),
  T('Sparkles', 'Effects › Intensity', 'twinkle glitter', { tab: 'effects', id: 'fx-spark' }),
  T('Light rays', 'Effects › Intensity', 'beams god rays', { tab: 'effects', id: 'fx-rays' }),
  T('Row lines', 'Machine › Reels', 'horizontal lines dividers separators between rows grid', { tab: 'machine', id: 'm-row-lines' }),
  T('Screen shake', 'Effects › Intensity', 'camera rumble', { tab: 'effects', id: 'fx-shake' }),
  T('Build-up shake on winning reels', 'Effects › Intensity', 'camera rumble landing each reel cell win build up growing rising sound sfx impact thump', { tab: 'effects', id: 'fx-land-shake' }),
  T('Flashes', 'Effects › Intensity', 'blink white', { tab: 'effects', id: 'fx-flash' }),
  T('Bloom glow', 'Effects › Intensity', 'glow halo', { tab: 'effects', id: 'fx-bloom' }),
  T('Background lights', 'Effects › Intensity', 'bokeh', { tab: 'effects', id: 'fx-bokeh' }),
  // Wheel
  T('Wheel segments', 'Wheel › Segments', 'prizes slices labels values', { tab: 'wheel', section: 'segments' }),
  T('Wheel turns', 'Wheel › Spin', 'rotations full turns', { tab: 'wheel', id: 'w-turns' }),
  T('Wheel landing', 'Wheel › Spin', 'centered natural edge tease almost slips nearly lose roll back overshoot', { tab: 'wheel', id: 'w-landing' }),
  T('Wheel framing and zoom', 'Wheel › Framing', 'zoom crop half top close up partial not full bigger than screen from above', { tab: 'wheel', id: 'w-framing' }),
  T('Wheel zoom', 'Wheel › Framing', 'size scale bigger radius crop', { tab: 'wheel', id: 'w-size' }),
  T('Wheel position', 'Wheel › Framing', 'centre center move offset across down x y', { tab: 'wheel', id: 'w-x' }),
  T('Push in on the wheel pointer', 'Wheel › Framing', 'camera zoom closer slows landing', { tab: 'wheel', id: 'w-push' }),
  T('Wheel pointer side', 'Wheel › Pointer', 'ticker flapper top bottom pointing up down', { tab: 'wheel', id: 'w-pointer' }),
  T('Wheel pointer size', 'Wheel › Pointer', 'ticker flapper bigger smaller', { tab: 'wheel', id: 'w-ptr-size' }),
  T('Wheel pointer art', 'Wheel › Pointer', 'ticker flapper image upload replace custom', { tab: 'wheel', id: 'wart-up-pointer' }),
  T('Wheel label font', 'Wheel › Look', 'typeface text segment labels font', { tab: 'wheel', id: 'w-font' }),
  T('Wheel label colour', 'Wheel › Look', 'text color gold silver white black', { tab: 'wheel', id: 'w-label-colour' }),
  T('Wheel text size', 'Wheel › Look', 'label text bigger smaller', { tab: 'wheel', id: 'w-label-size' }),
  T('Wheel text height', 'Wheel › Look', 'label text position distance from hub centre rim higher lower radius', { tab: 'wheel', id: 'w-label-height' }),
  T('Wheel icon size', 'Wheel › Look', 'segment icons pictures bigger smaller', { tab: 'wheel', id: 'w-icon-size' }),
  T('Wheel icon height', 'Wheel › Look', 'segment icons position distance from hub centre rim higher lower radius', { tab: 'wheel', id: 'w-icon-height' }),
  T('Wheel hub', 'Wheel › Look', 'centre center middle button hub size turns still', { tab: 'wheel', id: 'w-hub-size' }),
  T('Wheel parts on or off', 'Wheel › Look', 'rim bulbs pegs separators hub labels hide show', { tab: 'wheel', id: 'w-show-rim' }),
  T('Segment icons', 'Wheel › Segments', 'icon picture image per segment add built-in coin crown diamond seven', { tab: 'wheel', id: 'seg-i-0' }),
  T('Spin again or no win segments', 'Wheel › Segments', 'kind segment spin again respin free spin retry no win lose blank bust try again nothing', { tab: 'wheel', id: 'seg-k-0' }),
  T('Where a spin again lands next', 'Round inspector', 'then lands on spin again second spin', { round: ['wheel'], id: 'ri-seg-then' }, 'Shown when the wheel lands on a Spin again segment.'),
  T('Icons on every segment', 'Wheel › Segments', 'icon each all every segment auto fill prize', { tab: 'wheel', id: 'seg-icons-all' }),
  T('Wheel centre icon', 'Wheel › Look', 'center middle hub star logo icon', { tab: 'wheel', id: 'w-centre-icon' }),
  T('Segment with no colour', 'Wheel › Segments', 'transparent clear none no color fill wheel background face', { tab: 'wheel', id: 'seg-clear-colours' }),
  T('Wheel art', 'Asset Bank › Wheel', 'face background rim hub pointer replace upload image disc', { bank: 'wheel', id: 'wart-up-face' }),
  T('Upload fonts', 'Asset Bank › Fonts', 'font ttf otf typeface custom own', { bank: 'fonts', id: 'font-add' }),
  // Sound
  T('Sound on or off', 'Sound › Sound track', 'audio mute enable', { tab: 'sound', id: 'snd-on' }),
  T('Volume', 'Sound › Sound track', 'loud quiet master', { tab: 'sound', id: 'snd-vol' }),
  T('Download the sound track', 'Sound › Sound track', 'wav audio file', { tab: 'sound', id: 'snd-wav' }),
  T('Replace a sound with your own', 'Sound › Your own sounds', 'upload custom sfx wav mp3', { tab: 'sound', section: 'your-own-sounds' }),
  // Export
  T('Export to After Effects', 'Export › After Effects project', 'ae jsx package download', { tab: 'export', id: 'x-ae' }),
  T('Export formats', 'Export › After Effects project', 'sizes portrait square 4k batch', { tab: 'export', section: 'after-effects-project' }),
  T('Transparent background', 'Export › After Effects project', 'alpha prores no background', { tab: 'export', id: 'x-transparent' }),
  T('Render an MP4 preview', 'Export › Quick preview (MP4)', 'video movie', { tab: 'export', id: 'x-mp4' }),
  T('MP4 quality', 'Export › Quick preview (MP4)', 'bitrate', { tab: 'export', id: 'x-bitrate' }),
  T('Save this frame as PNG', 'Export › Still frame', 'screenshot image still transparent alpha', { tab: 'export', id: 'x-png' }),
  T('Download the soundtrack (WAV)', 'Export › Soundtrack (WAV)', 'sound track audio music mix wav file edit elsewhere', { tab: 'export', id: 'x-wav' }),
  // Asset Bank
  T('Upload symbol art', 'Asset Bank › Symbols', 'add symbols png images icons', { bank: 'symbols', id: 'a-add' }),
  T('Symbol win animation', 'Asset Bank › Symbols', 'sprite sheet png sequence frames animate', { bank: 'symbols', section: 'symbols' }),
  T('Classic and candy symbol sets', 'Asset Bank › Symbols', 'built in sample', { bank: 'symbols', id: 'a-set-classic' }),
  T('Symbol roles: wild, scatter, multiplier, bonus', 'Asset Bank › Symbols', 'role wild scatter multiplier bonus special', { bank: 'symbols', section: 'symbols' }),
  T('How often a symbol shows up', 'Asset Bank › Symbols', 'weight frequency filler common rare', { bank: 'symbols', section: 'symbols' }),
  T('Hold & Spin coins', 'Asset Bank › Coins', 'jackpot coins mini minor major grand coin values', { bank: 'coins', section: 'hold-spin-coins' }),
  T('Particle art', 'Asset Bank › Win particles', 'upload confetti coin star sprite', { bank: 'particles', id: 'pa-add' }),
  T('Background image', 'Asset Bank › Scene art', 'backdrop wallpaper', { bank: 'scene', id: 'asset-up-background' }),
  T('Frame overlay', 'Asset Bank › Scene art', 'border machine cabinet', { bank: 'scene', id: 'asset-up-frame' }),
  T('Logo image', 'Asset Bank › Scene art', 'brand title', { bank: 'scene', id: 'asset-up-logo' }),
  T('Title above the reels', 'Asset Bank › Scene art', 'name heading text', { bank: 'scene', id: 'a-title' }),
  // Rounds
  T('Quick sequence builder', 'Rounds', 'build generate auto sequence finale warm up', { section: 'seq/quick-sequence', id: 'qb-build' }),
  T('Add a round', 'Rounds', 'new spin outcome', { top: 'add-outcome' }),
  T('Round outcome', 'Round inspector', 'result win type', { round: 'any', id: 'ri-outcome' }),
  T('Win amount for a round', 'Round inspector', 'payout prize money', { round: ['small', 'medium'], id: 'ri-amount' }),
  T('Big win counts up to', 'Round inspector', 'tier mega epic', { round: ['big'], id: 'ri-tier' }),
  T('Winning symbol for a round', 'Round inspector', 'which symbol', { round: ['small', 'medium', 'big'], id: 'ri-symbol' }),
  T('Win pattern', 'Round inspector', 'line shape full screen', { round: ['small', 'medium', 'big'], id: 'ri-pattern' }),
  T('Tumble after the win', 'Round inspector', 'cascade chain', { round: ['small', 'medium', 'big'], id: 'ri-tumble' }),
  T('Expanding wild', 'Round inspector', 'wild fills reel', { round: ['small', 'medium', 'big'], id: 'ri-expand' }),
  T('Add a feature to a round', 'Round inspector', 'feature features add more extra wilds mystery multipliers cash collector boosters tumbles', { round: 'any', id: 'feat-add' }, 'Shown for rounds that can take features.'),
  T('Include a wild in the win', 'Round inspector', 'wild substitute', { round: ['small', 'medium', 'big'], id: 'ri-wild' }),
  T('Extra wilds on the grid', 'Round inspector', 'wilds more', { round: ['small', 'medium', 'big', 'none'], id: 'ri-extra-wilds' }),
  T('Multipliers in a round', 'Round inspector', 'multiplier bombs x2 x5 total', { round: ['small', 'medium', 'big'], id: 'ri-mult-add' }),
  T('Scatters landing', 'Round inspector', 'scatter count trigger', { round: ['freespins', 'bonus', 'nearmiss', 'wheel'], id: 'ri-scatters' }),
  T('Coins landing in a respin', 'Round inspector', 'hold spin coins respin', { round: ['respin', 'hstrigger'], id: 'ri-hs-coins' }),
  T('Sticky wilds', 'Round inspector', 'wild stick free spins', { round: ['small', 'medium', 'big'], id: 'ri-sticky' }, 'Shown for free spins rounds.'),
  T('Free spins awarded', 'Round inspector', 'count number', { round: ['freespins'], id: 'ri-fs' }),
  T('Sticky or walking wilds in free spins', 'Round inspector', 'sticky walking moving shifting wild steps left', { round: ['freespins'], id: 'ri-fs-wilds' }),
  T('Free spins retrigger', 'Round inspector', 'retrigger extra spins more spins add spins scatters during free spins', { round: ['freespins'], id: 'ri-free' }, 'Mark a Free spins trigger inside free spins as a Free spin.'),
  T('Multiplier wilds', 'Round inspector', 'wild multiplier x2 x3 wild badge', { round: ['small', 'medium', 'big'], id: 'ri-wmult' }),
  T('Mystery symbols', 'Round inspector', 'mystery reveal question mark blocks transform turn over', { round: ['none', 'small', 'medium', 'big'], id: 'ri-mystery' }),
  T('Cash symbols', 'Round inspector', 'cash money symbol coin values fish', { round: ['none', 'small', 'medium', 'big', 'nearmiss', 'freespins', 'bonus'], id: 'ri-cash' }),
  T('Collector', 'Round inspector', 'collect collector fisherman money bag cash collect big bass', { round: ['none', 'small', 'medium', 'big', 'nearmiss', 'freespins', 'bonus'], id: 'ri-collector' }),
  T('Boosters', 'Round inspector', 'booster boost upgrade pots fire beam laser saber wild upgrade symbol multiplier cash power up', { round: ['none', 'small', 'medium', 'big', 'nearmiss', 'freespins', 'bonus', 'wheel'], id: 'ri-boost' }, 'Turn the pots on in Features first.'),
  T('Wheel lands on', 'Round inspector', 'prize segment', { round: ['wheel'], id: 'ri-seg' }),
  T('Near miss reel', 'Round inspector', 'tease almost', { round: ['nearmiss'], id: 'ri-nm-reel' }),
  T('Winning symbols for one round', 'Round inspector › Look', 'jump merge pop override', { round: ['small', 'medium', 'big'], id: 'ri-winstyle' }),
  T('Particles for one round', 'Round inspector › Look', 'override confetti explosion', { round: ['small', 'medium', 'big', 'freespins', 'bonus', 'wheel'], id: 'ri-pfx' }),
  T('Spin length for one round', 'Round inspector › Spin and timing', 'duration mid', { round: 'any', id: 'ri-mid-default' }),
  T('Pause after a round', 'Round inspector › Spin and timing', 'hold wait', { round: 'any', id: 'ri-hold' }),
  T('Stop order for one round', 'Round inspector › Spin and timing', 'order', { round: 'any', id: 'ri-stop-order' }),
  T('Anticipation for one round', 'Round inspector › Spin and timing', 'tease reels pick', { round: 'any', id: 'ri-antic' }),
  T('New symbols for a round', 'Round inspector', 'reroll random shuffle', { round: 'any', id: 'ri-reroll' }),
  T('Preview one round', 'Round inspector', 'play solo', { round: 'any', id: 'ri-preview' }),
];

// Feature titles every group of synonyms leads to most directly, shown when
// the search box is empty.
export const POPULAR = ['Winning symbols jump into the score', 'Win particles', 'Asset Bank', 'Save project file', 'Export to After Effects', 'Spin length', 'Big win tiers', 'Keyboard shortcuts'];

const norm = (s) => String(s).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9%]+/g, ' ').trim();
const words = (s) => norm(s).split(' ').filter(Boolean);
// Words that carry no meaning in a query.
const STOP = new Set(['the', 'a', 'an', 'to', 'of', 'in', 'on', 'at', 'for', 'and', 'or', 'into', 'onto', 'they', 'them', 'it', 'its', 'is', 'are', 'i', 'my', 'me', 'can', 'how', 'do', 'does', 'with', 'what', 'which', 'want', 'where', 'when', 'be', 'become', 'get', 'set', 'up', 'all', 'some', 'this', 'that', 'there']);
const queryWords = (s) => {
  const w = words(s);
  const kept = w.filter((x) => !STOP.has(x));
  return kept.length ? kept : w;
};
const atWord = (hay, q) => (' ' + hay).includes(' ' + q);

const GROUP_OF = new Map();
SYNONYMS.forEach((g, i) => g.forEach((w) => {
  for (const ww of words(w)) {
    if (!GROUP_OF.has(ww)) GROUP_OF.set(ww, new Set());
    GROUP_OF.get(ww).add(i);
  }
}));

// Edit distance with transpositions, cut off early past `max`.
function near(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return false;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let best = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      best = Math.min(best, d[i][j]);
    }
    if (best > max) return false;
  }
  return d[a.length][b.length] <= max;
}

function synonymsOf(word) {
  const out = new Set();
  for (const gi of GROUP_OF.get(word) || []) for (const w of SYNONYMS[gi]) for (const ww of words(w)) if (ww !== word) out.add(ww);
  return out;
}

// How well one query word matches a list of words: exact or prefix 1,
// a synonym 0.7, a near miss (typo) 0.6, a typo of a synonym 0.45.
function wordScore(q, list) {
  let best = 0;
  let via = null;
  const max = q.length >= 7 ? 2 : q.length >= 4 ? 1 : 0;
  const syn = synonymsOf(q);
  for (const w of list) {
    if (w === q || (q.length >= 2 && w.startsWith(q))) return { s: 1, via: null };
    if (syn.has(w) && best < 0.7) {
      best = 0.7;
      via = w;
    }
    if (max && best < 0.6 && near(q, w, max)) {
      best = 0.6;
      via = w;
    }
  }
  // A typo of a word that has synonyms ("magent" for magnet).
  if (best < 0.45 && max) {
    for (const k of GROUP_OF.keys()) {
      if (k.length < 4 || !near(q, k, max)) continue;
      const s2 = synonymsOf(k);
      s2.add(k);
      if (list.some((w) => s2.has(w))) {
        best = 0.45;
        via = k;
        break;
      }
    }
  }
  return { s: best, via };
}

// Adds the labels read from the live editor to the index. A label of a
// control the index already lists becomes one of its search words; every
// other labelled control becomes an entry of its own. The same control seen
// for several round outcomes is one entry that knows all of them.
export function buildIndex(harvested, list = FEATURES) {
  const byId = new Map();
  const byTitle = new Map();
  const place = (g) => g.tab || (g.round ? 'round' : g.bank ? 'bank' : '');
  const out = list.map((f) => {
    const c = { ...f, go: { ...f.go } };
    const id = f.go.id || f.go.top;
    if (id) byId.set(id, c);
    byTitle.set(`${norm(f.title)}|${place(f.go)}`, c);
    return c;
  });
  const seen = new Map();
  for (const h of harvested) {
    if (!h || !h.title) continue;
    const same = byId.get(h.go.id) || byTitle.get(`${norm(h.title)}|${place(h.go)}`);
    if (same) {
      for (const extra of [h.title, h.keys]) if (extra && !norm(same.keys || '').includes(norm(extra))) same.keys = `${same.keys || ''} ${extra}`;
      if (Array.isArray(same.go.round) && Array.isArray(h.go.round)) same.go.round = [...new Set([...same.go.round, ...h.go.round])];
      continue;
    }
    const key = `${norm(h.title)}|${h.where}`;
    const prev = seen.get(key);
    if (prev) {
      if (Array.isArray(prev.go.round) && Array.isArray(h.go.round)) prev.go.round = [...new Set([...prev.go.round, ...h.go.round])];
      continue;
    }
    const entry = { ...h, go: { ...h.go } };
    seen.set(key, entry);
    // Later words for the same control (a tooltip, say) join this entry.
    if (h.go.id && !byId.has(h.go.id)) byId.set(h.go.id, entry);
    out.push(entry);
  }
  return out;
}

const prepared = new WeakMap();
function prep(f) {
  let p = prepared.get(f);
  if (!p) {
    p = { title: words(f.title), keys: words(f.keys || ''), where: words(f.where || ''), titleN: norm(f.title), keysN: norm(f.keys || '') };
    prepared.set(f, p);
  }
  return p;
}

// Ranked matches for a query: [{ feature, score, via }].
export function searchFeatures(query, list = FEATURES, limit = 12) {
  const qw = queryWords(query);
  const qn = qw.join(' ');
  if (!qw.length) return POPULAR.map((t) => list.find((f) => f.title === t)).filter(Boolean).map((feature) => ({ feature, score: 0, via: null }));
  const out = [];
  for (const f of list) {
    const p = prep(f);
    let total = 0;
    let hit = 0;
    let via = null;
    for (const q of qw) {
      const a = wordScore(q, p.title);
      const b = wordScore(q, p.keys);
      const c = wordScore(q, p.where);
      const s = Math.max(a.s * 30, b.s * 20, c.s * 8);
      if (s > 0) hit++;
      // A word found in several places (title and keys) edges ahead of a tie.
      total += s > 0 ? s + a.s + b.s + c.s : 0;
      const v = a.s * 30 >= b.s * 20 ? a.via || (a.s ? null : b.via) : b.via;
      if (!via && v && s > 0) via = v;
    }
    if (!hit) continue;
    if (hit < qw.length) total *= qw.length > 1 ? 0.35 : 0;
    if (atWord(p.titleN, qn)) total += 40;
    else if (atWord(p.keysN, qn)) total += 15;
    if (total > 0) out.push({ feature: f, score: total, via });
  }
  out.sort((x, y) => y.score - x.score || x.feature.title.length - y.feature.title.length);
  return out.slice(0, limit);
}
