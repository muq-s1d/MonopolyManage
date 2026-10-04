// Builds the Android app: a Trusted Web Activity that opens the live site full screen, signed with the key in
// ~/.config/counting-house (back that folder up: every future update must be signed with the same key).
//   npm run build                                   icons from the live site
//   ICON_BASE=http://localhost:5173 npm run build   icons from a dev server, before they are deployed
import { ConsoleLog, TwaGenerator, TwaManifest } from '@bubblewrap/core'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const HOST = 'monopoly-manage.vercel.app'
const here = path.dirname(new URL(import.meta.url).pathname)
const project = path.join(here, 'project')
const out = path.join(here, 'the-counting-house.apk')
const sdk = process.env.ANDROID_HOME ?? path.join(os.homedir(), 'Android/Sdk')
const jdk = process.env.JAVA_HOME ?? '/usr/lib/jvm/java-17-openjdk-amd64'
const tools = path.join(sdk, 'build-tools/35.0.0')
const icons = process.env.ICON_BASE ?? `https://${HOST}`

// the shell's version lives with the site's release notes, so the site knows when to offer an update
const version = Number(/APK = \{ version: (\d+)/.exec(fs.readFileSync(path.join(here, '../src/releases.ts'), 'utf8'))[1])

// the signing key and its password, kept outside the repository
const env = Object.fromEntries(fs.readFileSync(path.join(os.homedir(), '.config/counting-house/android.env'), 'utf8')
  .trim().split('\n').map(l => l.split(/=(.*)/s).slice(0, 2)))

const manifest = new TwaManifest({
  packageId: 'com.muqs1d.countinghouse', host: HOST, name: 'The Counting House', launcherName: 'Counting House',
  display: 'standalone', orientation: 'default',
  themeColor: '#0F3B2E', navigationColor: '#0A2A21', backgroundColor: '#0A2A21',
  startUrl: `/?apk=${version}`, webManifestUrl: `${icons}/manifest.webmanifest`,
  iconUrl: `${icons}/icon-512.png`, maskableIconUrl: `${icons}/icon-maskable-512.png`,
  splashScreenFadeOutDuration: 300, enableNotifications: false, enableSiteSettingsShortcut: false, fallbackType: 'customtabs',
  signingKey: { path: env.KEYSTORE, alias: env.ALIAS }, appVersion: String(version), appVersionCode: version,
})

fs.rmSync(project, { recursive: true, force: true })
await new TwaGenerator().createTwaProject(project, manifest, new ConsoleLog('twa'))

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: 'inherit', ...opts })
const gradleEnv = { ...process.env, JAVA_HOME: jdk, ANDROID_HOME: sdk }
// a small daemon-free build: this machine has little memory to spare
run(path.join(project, 'gradlew'), ['assembleRelease', '--no-daemon', '-Dorg.gradle.jvmargs=-Xmx1536m'], { cwd: project, env: gradleEnv })

const unsigned = path.join(project, 'app/build/outputs/apk/release/app-release-unsigned.apk')
const aligned = path.join(project, 'aligned.apk')
run(path.join(tools, 'zipalign'), ['-f', '-p', '4', unsigned, aligned])
run(path.join(tools, 'apksigner'), ['sign', '--ks', env.KEYSTORE, '--ks-key-alias', env.ALIAS,
  '--ks-pass', `env:CH_PASS`, '--key-pass', `env:CH_PASS`, '--out', out, aligned], { env: { ...gradleEnv, CH_PASS: env.PASSWORD } })
run(path.join(tools, 'apksigner'), ['verify', '--print-certs', out], { env: gradleEnv })
console.log(`\nBuilt ${out} (version ${version})`)
