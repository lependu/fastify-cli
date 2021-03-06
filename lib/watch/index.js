const path = require('path')
const cp = require('child_process')
const chalk = require('chalk')

const {
  GRACEFUL_SHUT
} = require('./constants.js')

const EventEmitter = require('events')
const chokidar = require('chokidar')
const forkPath = path.join(__dirname, './fork.js')

const emitter = new EventEmitter()

let allStop = false
let childs = []

const stop = (watcher = null, err = null) => {
  childs.forEach(function (child) {
    child.kill()
  })

  childs = []
  if (err) { console.log(chalk.red(err)) }
  if (watcher) {
    allStop = true
    watcher.close()
  }
}

const watch = function (args) {
  process.on('uncaughtException', () => {
    stop()
    childs.push(run('restart'))
  })

  const run = (event) => {
    const childEvent = { childEvent: event }
    const env = Object.assign({}, process.env, childEvent)
    const _child = cp.fork(forkPath, args, {
      env: env,
      cwd: process.cwd(),
      encoding: 'utf8'
    })

    _child.on('exit', function (code, signal) {
      if (!code === 0) { stop() }
      if (childs.length === 0 && !allStop) { childs.push(run('restart')) }
      return null
    })

    _child.on('message', (event) => {
      const { type, err } = event
      if (err) {
        emitter.emit('error', err)
        return null
      }

      emitter.emit(type, err)
    })

    return _child
  }

  childs.push(run('start'))

  const watcher = chokidar.watch(process.cwd(), { ignored: /(node_modules|\.git|bower_components|build|dist)/ })
  watcher.on('ready', function () {
    watcher.on('all', function () {
      try {
        const child = childs.shift()
        child.send(GRACEFUL_SHUT)
      } catch (err) {
        if (childs.length !== 0) {
          console.log(chalk.red(err))
          stop(watcher, err)
        }
        childs.push(run('restart'))
      }
    })
  })

  emitter.on('error', (err) => {
    stop(watcher, err)
  })

  emitter.on('close', () => {
    stop(watcher)
  })

  return emitter
}

module.exports = watch
