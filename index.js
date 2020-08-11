#!/usr/bin/env node
const os = require('os');
const progress = require('cli-progress');
const { Worker } = require('worker_threads');
const { program } = require('commander');

const bar = new progress.SingleBar({}, progress.Presets.shades_classic);
const cores = os.cpus().length;
program.version('0.0.1');

program
    .requiredOption('-d, --dungeon-id <id>', 'dungeon id to test')
    .option('-f, --floor <int>', 'floor to start on', 1, parseInt)
    .option('-m, --max-floor', 'retain max floor')
    .requiredOption('-l, --level <int>', 'item level to set', 9, parseInt)
    .requiredOption('-s, --sharpness <int>', 'sharpness to set', 10, parseInt)

program.parse(process.argv);

function chunk(array, size) {
    const chunked_arr = [];
    let index = 0;
    while (index < array.length) {
        chunked_arr.push(array.slice(index, size + index));
        index += size;
    }
    return chunked_arr;
}
function permutation(array) {
    function p(array, temp) {
        var i, x;
        if (!array.length) {
            result.push(temp);
        }
        for (i = 0; i < array.length; i++) {
            x = array.splice(i, 1)[0];
            p(array, temp.concat(x));
            array.splice(i, 0, x);
        }
    }

    var result = [];
    p(array, []);
    return result;
}

function combinations(array) {
    return new Array(1 << array.length).fill().map(
        (e1,i) => array.filter((e2, j) => i & 1 << j));
}

function subsets(array, size) {
    return combinations(array).filter(a => a.length == size).reduce((acc, cur) => [...acc, ...permutation(cur)], [])
}

const dungeons = require('./data/dungeons.json');
const heroes = require('./data/heroes.json');
let playbookMap = {};
for(const hero of heroes) {
    playbookMap[hero.id] = hero.playbooks;
}
const transforms = [
    // base might
    ['pow','hp','hp','hp','pow','hp','hp'],
    // base moxie/mind
    ['pow','hp','hp','hp','pow','hp','pow'],
    // full sets
    ['hp','hp','hp','hp','hp','hp','hp'],
    ['pow','pow','pow','pow','pow','pow','pow'],
    // common moxie/mind
    ['pow','pow','pow','hp','pow','pow','pow']
];

const {dungeonId, floor, maxFloor, level, sharpness} = program;
const workerData = {dungeonId, floor, maxFloor, level, sharpness};

async function run() {
    console.time('run');

    const dungeon = dungeons.find(d => d.id === program.dungeonId);
    
    const ids = heroes.map(h => h.id);
    const sets = subsets(ids, dungeon.partySize);

    let parties = [];
    for(let set of sets) {
        for(let id of playbookMap[set[0]]) {
            if(set.length > 1) {
                for(let id2 of playbookMap[set[1]]) {
                    if(set.length > 2) {
                        for(let id3 of playbookMap[set[2]]) {
                            if(set.length > 3) {
                                for(let id4 of playbookMap[set[3]]) {
                                    parties.push([`${set[0]}.${id}`,`${set[1]}.${id2}`,`${set[2]}.${id3}`,`${set[3]}.${id4}`]);
                                }
                            } else {
                                parties.push([`${set[0]}.${id}`,`${set[1]}.${id2}`,`${set[2]}.${id3}`]);
                            }
                        }
                    } else {
                        parties.push([`${set[0]}.${id}`,`${set[1]}.${id2}`]);
                    }
                }
            } else {
                parties.push([`${set[0]}.${id}`]);
            }
        }
    }

    bar.start(parties.length, 0);
    try {
        let results = [];
        let current = 0;
        const response = await Promise.all(chunk(parties, parties.length / cores).map((sets, i) => {
            return new Promise((resolve, reject) => {
                const worker = new Worker('./worker.js', {workerData: {...workerData, parties: sets}});
                worker.on('message', (data) => {
                    if(data.status) { 
                        current+= 1000;
                        bar.update(current);
                    }
                    if(data.results) resolve(data.results);
                });;
                worker.on('error', reject);
                worker.on('exit', (code) => {
                    if(code !== 0) {
                        reject(new Error(`Worker stopped with exit code ${code}`));
                    }
                })
            });
        }));
        bar.stop();
        results = response.flat();
        console.log(results.filter(r => r.status === 'Success').sort((a,b) => {
            if(a.floor !== b.floor) return b.floor - a.floor;
            return a.dungeonTime - b.dungeonTime;
        }));
    } catch (err) {
        console.log(err);
    }
    console.timeEnd('run');
}

run();