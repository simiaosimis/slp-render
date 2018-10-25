#!/usr/bin/env node
'use strict'

var fs = require('fs')
var path = require('path')
var SLP = require('genie-slp')
var Palette = require('jascpal')
var meow = require('meow')
var mkdirp = require('mkdirp')
var PNG = require('pngjs').PNG

var cli = meow({
  help: [
    'Usage',
    '  $ slp-render <slp-file> [--inspect] [<out-dir>] [--palette=<file>] [--player=<number>] [--draw-outline]',
    '',
    'Options',
    '  --inspect       Show metadata about the file, like the size and the amount of frames.',
    '  --palette       JASC-PAL palette file path to get colours from. Defaults to',
    '                  the default Age of Empires 2 unit palette (50500).',
    '  -p, --player    Player colour to use for rendering units. Defaults to 1.',
    '  --draw-outline  Draw the outline around the unit instead of the unit itself.',
    '                  This is used by the games for rendering units behind buildings.',
    '',
    'Example',
    '  $ slp-render graphics.drs/2.slp archer/ --player=3',
    '  $ slp-render interfac.drs/50100.slp loading-background/ --palette=interfac.drs/50532.bin'
  ]
}, {
  alias: {
    p: 'player'
  },
  boolean: [
    'inspect'
  ]
})

var flags = cli.flags

var defaultPalette = path.join(__dirname, 'default-palette.pal')

// Player colours in SLPs are ordered slightly differently than in-game.
// particularly, orange is #5 in SLPs, but #7 in-game.
// this maps in-game colour indices to SLP colour indices.
var playerIdMap = {
  5: 6, // cyan
  6: 7, // magenta
  7: 5 // orange
}

function arrayBufferToUint8Array(buffer){
    var arr = new Uint8Array(buffer);
    return arr;
}

function centralizeX(buffer, width, amount, begining){
    var arr = []
    for(var i = 0; i < buffer.length; ++i){
      if(i%(width*4) == 0 && (i || begining)) 
        for(var j = 0; j < amount; ++j){
          arr.push(0, 0, 0, 0)
        }
      arr.push(buffer[i])
    }
    if(!begining) arr.push(0, 0, 0, 0)
    var res = new Uint8Array(arr.length)
    for (var i = 0; i < arr.length; i++) {
      res[i] = arr[i]
    }
    return res
}

function centralizeY(buffer, width, amount, begining){
    var arr = []
    if(begining){
      for(var i = 0; i < amount; ++i){
        for(var j = 0; j < width; ++j){
          arr.push(0, 0, 0, 0)
        }
      }
    }
    for(var i = 0; i < buffer.length; ++i){
      arr.push(buffer[i])
    }
    if(!begining){
      for(var i = 0; i < amount; ++i){
        for(var j = 0; j < width; ++j){
          arr.push(0, 0, 0, 0)
        }
      }
    }
    var res = new Uint8Array(arr.length)
    for (var i = 0; i < arr.length; i++) {
      res[i] = arr[i]
    }
    return res
}

function inspect (file) {
  var slp = SLP(fs.readFileSync(file))
  slp.parseHeader()
  var palette = Palette(fs.readFileSync(flags.palette || defaultPalette, 'ascii'))
  var player = flags.player == null ? 1 : (playerIdMap[flags.player] || flags.player)
  var lines = [
    'Version: ' + slp.version,
    'Comment: ' + slp.comment,
    'Frames (' + slp.numFrames + '):'
  ]
  slp.frames.forEach(function (frame, i) {
    lines.push(
      '#' + i,
      '  Size: ' + frame.width + 'x' + frame.height,
      '  Center: ' + frame.hotspot.x + 'x' + frame.hotspot.y,
      '  Properties: ' + frame.properties
    )
  })

  lines.forEach(function (line) {
    console.log(line)
  })
}

function run (file, outDir) {
  var slp = SLP(fs.readFileSync(file))
  var player = flags.player == null ? 1 : (playerIdMap[flags.player] || flags.player)
  var drawOutline = !!flags.drawOutline
  var palette = Palette(fs.readFileSync(flags.palette || defaultPalette, 'ascii'))
  if (slp.numFrames > 0) {
    mkdirp.sync(outDir)
  }
  for (var i = 0; i < slp.numFrames; i += 1) {
    var frame = slp.renderFrame(i, palette, {
      player: player,
      drawOutline: drawOutline
    })
    var arr = arrayBufferToUint8Array(frame.data.buffer)
    var centerX = parseInt(frame.width/2)
    var diffX = Math.abs(centerX - slp.frames[i].hotspot.x)
    var centerY = parseInt(frame.height/2)
    var diffY = Math.abs(centerY - slp.frames[i].hotspot.y)
    
    var png = new PNG({
      width: frame.width + diffX*2,
      height: frame.height + diffY*2
    })
    //png.data = Buffer.from(frame.data.buffer)
    png.data = Buffer.from(centralizeY(arrayBufferToUint8Array(centralizeX(arr, frame.width, diffX*2, centerX > slp.frames[i].hotspot.x).buffer),
                                       png.width, diffY*2, centerY > slp.frames[i].hotspot.y).buffer)
    png.pack().pipe(
      fs.createWriteStream(path.join(outDir, i + '.png'))
    )
  }
}

function exit () {
  cli.showHelp()
  process.exit(1)
}

if (flags.inspect) {
  if (cli.input.length < 1) {
    exit()
  }
  inspect(cli.input[0])
} else if (cli.input.length < 2) {
  exit()
} else {
  run(cli.input[0], cli.input[1] + '')
}
