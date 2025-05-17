// https://bun.sh/docs/runtime/shell
// https://github.com/SBoudrias/Inquirer.js

import { input, confirm, select, Separator } from '@inquirer/prompts'
import { $ } from 'bun'
import { parseArgs } from 'util'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { dedent } from '@qnighy/dedent'

const logo = `
🔫🔫🔫🔫🔫🔫🔫🔫🔫🔫🔫🔫🔫🔫

 ██████  ██    ██ ███    ██ 
██       ██    ██ ████   ██ 
██   ███ ██    ██ ██ ██  ██ 
██    ██ ██    ██ ██  ██ ██ 
 ██████   ██████  ██   ████ 

🔫🔫🔫🔫🔫🔫🔫🔫🔫🔫🔫🔫🔫🔫
`

// https://github.com/SBoudrias/Inquirer.js/issues/1478
if (process.platform === 'win32') {
    const readline = await import('node:readline')
    readline
        .createInterface({
            input: process.stdin,
            output: process.stdout,
        })
        .on('SIGINT', () => {
            process.emit('SIGINT')
        })
}

async function checkBinaries() {
    const requiredCommands = ['git', 'gh']
    const missingCommands = []
    for (const command of requiredCommands) {
        let commandOutput
        if (process.platform === 'win32') {
            commandOutput = await $`where ${command}`.quiet().nothrow()
        } else {
            commandOutput = await $`command -v ${command}`.quiet().nothrow()
        }
        if (commandOutput.exitCode !== 0) {
            missingCommands.push(command)
        }
    }
    if (missingCommands.length > 0) {
        console.error('Missing required commands:', missingCommands.join(', '))
        console.error('Please install and configure them and try again.')
        process.exit(1)
    }
}

async function loadConfig() {
    const configFile = path.join(process.env.HOME || process.env.USERPROFILE || '', '.gun.conf')
    const config: Record<string, boolean> = {
        CREATE_PR: true,
        FUNNY_COMMIT: true,
        AUTO_MERGE: true,
        BACK_TO_DEFAULT: true,
        DELETE_BRANCH: true,
    }
    try {
        const configFileContent = await readFile(configFile, 'utf-8')
        const configLines = configFileContent.split('\n')
        for (const line of configLines) {
            const [key, value] = line.split('=')
            if (key && value) {
                const trimmedKey = key.trim()
                const trimmedValue = value.trim()
                if (trimmedKey in config) {
                    if (trimmedValue === 'true') {
                        config[trimmedKey] = true
                    } else if (trimmedValue === 'false') {
                        config[trimmedKey] = false
                    } else {
                        console.warn(`Invalid value for ${trimmedKey}: ${trimmedValue}. Using default value.`)
                    }
                } else {
                    console.warn(`Unknown config key: ${trimmedKey}. Ignoring.`)
                }
            }
        }
    } catch (err) {
        await checkBinaries()

        console.log(logo)
        console.log('Welcome to \x1b[1mg\x1b[0m(itb)\x1b[1mun\x1b[0m setup')
        const createPr = await confirm({ message: 'Do you want to create a PR by default?', default: true })
        const funnyCommit = await confirm({ message: 'Do you want to create funny commit messages?', default: true })
        const autoMerge = await confirm({ message: 'Do you want to enable automerge at the end?', default: true })
        const backToMain = await confirm({
            message: 'Do you want to switch back to main after PR created?',
            default: true,
        })
        const deleteBranch = await confirm({ message: 'Do you want to delete Branch after PR created?', default: true })
        // prettier-ignore
        const configContent = dedent`
            CREATE_PR=${createPr}
            FUNNY_COMMIT=${funnyCommit}
            AUTO_MERGE=${autoMerge}
            BACK_TO_DEFAULT=${backToMain}
            DELETE_BRANCH=${deleteBranch}
            `.replace(/^\s*[\r\n]/gm, '')
        await Bun.write(configFile, configContent)
        console.log('Config file created:', configFile)
        process.exit(0)
    }
    return config
}

const config = await loadConfig()

async function copyToClipboard(text: string) {
    if (process.platform === 'win32') {
        await $`echo ${text} | clip`.quiet().nothrow()
    }
    if (process.platform === 'linux') {
        await $`echo -n ${text} | xclip -i -selection c`.quiet().nothrow()
    }
    if (process.platform === 'darwin') {
        await $`echo ${text} | pbcopy`.quiet().nothrow()
    }
}

async function getRandomString(length: number) {
    const letters = 'abcdefghijklmnopqrstuvwxyz'
    let result = ''
    for (let i = 0; i < length; i++) {
        result += letters[Math.floor(Math.random() * letters.length)]
    }
    return result
}

async function getCommitMessage(funnyCommit: boolean) {
    if (!funnyCommit) {
        return 'wip'
    }
    const baseDir = path.dirname(process.argv[1])
    const commitMessageFile = `${baseDir}/commit_messages.txt`
    const commitMessageFileLines = await readFile(commitMessageFile, 'utf-8')
        .then((data) => {
            const lines = data.split('\n').filter((line) => !line.startsWith('#') && line.trim() !== '')
            return lines
        })
        .catch((err) => {
            console.error('Error reading file:', err)
            process.exit(1)
        })
    const randomLineIndex = Math.floor(Math.random() * commitMessageFileLines.length)
    const funnyCommitMessage = commitMessageFileLines[randomLineIndex].trim()

    return funnyCommitMessage
}

const { values, positionals } = parseArgs({
    args: Bun.argv,
    options: {
        debug: {
            type: 'boolean',
        },
    },
    strict: true,
    allowPositionals: true,
})

if (values.debug) {
    const fs = await import('node:fs')
    const readme = fs.readFileSync('README.md', 'utf-8')
    fs.writeFileSync('README.md', `${readme}#`)
}

const currentBranchOutput = await $`git branch --show-current`.text()
const baseBranch = currentBranchOutput.trim()

const statusOutput = await $`git status --porcelain`.text()
const isClean = statusOutput.trim() === ''
if (isClean) {
    console.log('Nothing to commit')
    process.exit(0)
}

const isDefaultBranch = baseBranch === 'main' || baseBranch === 'master' || baseBranch === 'bullseye'

if (!isDefaultBranch) {
    const wipIt = await confirm({ message: 'wip?', default: true })

    const commitMessage = await getCommitMessage(config.FUNNY_COMMIT)

    if (wipIt) {
        await $`git add .`.quiet()
        console.log('📂 Staged all changes')
        await $`git commit -m "${commitMessage}"`.quiet()
        console.log(`📝 Commit message: ${commitMessage}`)
        await $`git push`.quiet()
        console.log('🚀 Pushed changes to remote')
    }
}

if (isDefaultBranch) {
    const createBranch = await confirm({ message: 'Create Branch?', default: true })
    if (createBranch) {
        const timestamp = Math.floor(Date.now() / 1000)
        const randomChars = await getRandomString(3)
        const branchName = await input({
            message: 'Branch name:',
            default: `${timestamp}-${randomChars}`,
        })

        const fixedBranchName = branchName.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()

        const commitMessage = await input({
            message: 'Commit message:',
            required: true,
        })

        const createPr = await confirm({ message: 'Create PR?', default: config.CREATE_PR })

        let enableAutoMerge = false
        if (createPr) {
            enableAutoMerge = await confirm({ message: 'Enable auto merge?', default: config.AUTO_MERGE })
        }
        const backToDefault = await confirm({ message: `Back to ${baseBranch}?`, default: config.BACK_TO_DEFAULT })

        let deleteBranch = false
        if (backToDefault) {
            deleteBranch = await confirm({ message: 'Delete branch?', default: config.DELETE_BRANCH })
        }

        await $`git checkout -b ${fixedBranchName}`.quiet()
        console.log('🌿 Created and checked out to new branch:', fixedBranchName)

        await $`git add .`.quiet()
        console.log('📂 Staged all changes')

        await $`git commit -m "${commitMessage}"`.quiet()
        console.log('📝 Commit message:', commitMessage)

        await $`git push -u origin ${fixedBranchName}`.quiet()
        console.log('🚀 Pushed branch to remote:', fixedBranchName)

        if (createPr) {
            const outputPrCreate = await $`gh pr create -f -B ${baseBranch}`.nothrow()

            if (outputPrCreate.exitCode !== 0) {
                console.log('🚨 Could not create PR')
                console.log(`🚨 PR create stdout: ${outputPrCreate.stdout}`)
                console.log(`🚨 PR create stderr: ${outputPrCreate.stderr}`)
                process.exit(1)
            }

            const trimmedOutput = outputPrCreate.text().trim()
            console.log(`🔗 Created PR: ${trimmedOutput}`)

            await copyToClipboard(trimmedOutput)
            console.log('📋 Copied PR URL to clipboard')

            const prNumber = outputPrCreate.text().toString().replace(/\n/g, '').trim().split('/').pop()

            if (enableAutoMerge) {
                const autoMergeResult = await $`gh pr merge --auto --squash ${prNumber}`.nothrow().quiet()
                if (autoMergeResult.exitCode === 0) {
                    console.log('👋 Enabled auto-merge')
                } else {
                    console.log('👎 Could not enable auto-merge')
                    console.log(`👎 Auto-merge stdout: ${autoMergeResult.stdout}`)
                    console.log(`👎 Auto-merge stderr: ${autoMergeResult.stderr}`)
                }
            }
        }

        if (backToDefault) {
            console.log(`🔙 Back to ${baseBranch} `)
            await $`git checkout ${baseBranch}`.quiet().text()
        }

        if (deleteBranch) {
            if (deleteBranch) {
                await $`git branch -d ${fixedBranchName}`.quiet()
                console.log('🗑️  Deleted branch:', fixedBranchName)
            }
        }
    }
}
