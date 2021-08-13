# av-encoder
 Encode & compress audio/video specifically for web.

* `encode-audio`: Takes a list of folders of audio files and converts them to .opus, .caf (opus codec), and .mp3.
* `encode-video`: Takes a list of folders of video files (currently mp4 & mov) and outputs an mp4 for each, and optionally a .wav audio track.

### Installation
`npm install @andrewstart/av-encoder`

### Project Config file
You'll need to create a JSON5 or JSON formatted project config file, with the default name/location being `./ave-config.json5`.

```javascript
{
    // configuration for audio
    audio: {
        // root folder for all src paths
        baseSrc: 'src/audio',
        // root folder for all dest paths
        baseDest: 'assets/audio',
        // default properties for audio encoding, if not specified
        default: {
            // Target bitrate for .opus & .caf VBR in the form "<number>k". Lower is lower quality.
            opusTargetBitrate: '32k',
            // Quality for .mp3 VBR, 0-9 with higher being lower quality.
            mp3Quality: '9',
        },
        // list of source folders and destinations. Source folders are not recursive, and destinations can be
        // shared.
        folders: [
            {
                src: 'sfx',
                dest: 'sfx',
            },
            {
                src: 'sfx/loops',
                dest: 'sfx/loops',
                // each folder can have specific encoding properties
                opusTargetBitrate: '48k',
                mp3Quality: '7'
            },
            {
                src: 'vo',
                dest: 'vo',
                // you can also override settings for individual files if so desired
                overrides: {
                    'intro.wav': {
                        opusTargetBitrate: '48k',
                        mp3Quality: '7'
                    }
                }
            },
        ],
    },
    // configuration for video is exactly the same as for audio, but with different encoding settings
    video: {
        baseSrc: 'src/video',
        baseDest: 'assets/video',
        default: {
            // MP4 quality: 0 is lossless, 23 is default, and 51 is worst possible. 18-28 is a sane range.
            quality: 28,
            // Width of the video, to handle resizing. This is required for each video, so you may need to set it
            // individually if you have multiple different sized videos
            width: 1280,
            // If audioOut is set, the video will not have an audio track, which will instead be split out into a
            // .wav file to this location (relative to baseSrc from the video configuration)
            audioOut: '../audio/vo'
        },
        // see above for how folders work
        folders: []
    }
}
```

### Project cache files
Files for audio & video caches to track which files need to be encoded and which don't will be created in your project. `.aveaudiocache` and `.avevidiocache` will be created when encoding audio and video, respectively. If your output files are tracked with version control, then these cache files should be tracked as well.