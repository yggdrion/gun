// https://bun.sh/docs/runtime/shell
// https://github.com/SBoudrias/Inquirer.js

import { input, confirm, select, Separator } from '@inquirer/prompts'
import { $ } from 'bun'
import { parseArgs } from 'util'

const requiredCommands = ['git', 'gh']
const missingCommands = []
for (const command of requiredCommands) {
    const commandOutput = await $`command -v ${command}`.quiet().nothrow()
    if (commandOutput.exitCode !== 0) {
        missingCommands.push(command)
    }
}
if (missingCommands.length > 0) {
    console.error('Missing required commands:', missingCommands.join(', '))
    console.error('Please install them and try again.')
    process.exit(1)
}

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

const pwdOutput = await $`pwd`.text()
const pwd = pwdOutput.trim()

// console.log(`pwd: ${pwd}`)

const repoNameOutput = await $`git rev-parse --show-toplevel`.text()
const repoName = repoNameOutput.trim().split('/').pop()

// console.log(`rep: ${repoName}`)

const currentBranchOutput = await $`git branch --show-current`.text()
const baseBranch = currentBranchOutput.trim()

// console.log(`current branch: ${baseBranch}`)

// check if status is clean, if clean exit

const statusOutput = await $`git status --porcelain`.text()
const isClean = statusOutput.trim() === ''
if (isClean) {
    console.log('Nothing to commit')
    process.exit(0)
}

// check if currentBranch is a timestamp

const isDefaultBranch = baseBranch === 'main' || baseBranch === 'master' || baseBranch === 'bullseye'

if (!isDefaultBranch) {
    //console.log('Current branch no base branch')

    const wipIt = await confirm({ message: 'wip?', default: true })

    if (wipIt) {
        await $`git add .`.quiet()
        console.log('📂 Staged all changes')
        await $`git commit -m "wip"`.quiet()
        console.log('📝 Commit message: wip')
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

        const createPr = await confirm({ message: 'Create PR?', default: true })
        const enableAutoMerge = await confirm({ message: 'Enable auto merge?', default: true })
        const backToDefault = await confirm({ message: `Back to ${baseBranch}?`, default: true })

        let deleteBranch = false
        if (backToDefault) {
            deleteBranch = await confirm({ message: 'Delete branch?', default: true })
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
            const outputPrCreate = await $`gh pr create -f -B ${baseBranch}`.text()
            const trimmedOutput = outputPrCreate.trim()
            console.log(`🔗 Created PR: ${trimmedOutput}`)

            await copyToClipboard(trimmedOutput)
            console.log('📋 Copied PR URL to clipboard')

            const prNumber = outputPrCreate.toString().replace(/\n/g, '').trim().split('/').pop()

            if (enableAutoMerge) {
                const autoMergeResult = await $`gh pr merge --auto --squash ${prNumber}`.nothrow().quiet()
                if (autoMergeResult.exitCode === 0) {
                    console.log('👋 Enabled auto-merge')
                } else {
                    console.log('👎 Could no enable auto-merge')
                }
            }
        }

        if (backToDefault) {
            console.log(`🔙 Back to ${baseBranch}`)
            await $`git checkout ${baseBranch}`.quiet().text()
        }

        if (deleteBranch) {
            if (deleteBranch) {
                await $`git branch -d ${fixedBranchName}`.quiet()
                console.log('🗑️ Deleted branch:', fixedBranchName)
            }
        }
    }
}
