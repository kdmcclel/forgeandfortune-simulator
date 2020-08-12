const {workerData, parentPort} = require('worker_threads');


function pick(o, ...fields) {
    return fields.reduce((a, x) => {
        if(o.hasOwnProperty(x)) a[x] = o[x];
        return a;
    }, {});
}
const interleave = ([ x, ...xs ], ys = []) => (x === undefined ? ys : [ x, ...interleave (ys, xs) ]);

const miscData = require('./data/misc.json')[0];
const buffData = require('./data/buffs.json');
const dungeonData = require('./data/dungeons.json');
const heroData = require('./data/heroes.json');
const mobData = require('./data/mobs.json');
const playbookData = require('./data/playbook.json');
const recipeData = require('./data/recipes.json');
const skillData = require('./data/skills.json');

class context {
    constructor() {}
}

class Item {
    constructor(props) {
        Object.assign(this, props);
    }
}
let containerid = 0;
class ItemContainer {
    constructor(id, rarity) {
        this.id = id;
        this.item = recipeList.byId(id);
        this.name = this.item.name;
        this.type = this.item.type;
        this.lvl = this.item.lvl;
        this.rarity = rarity;
        this.containerId = containerid++;
        this.sharp = 0;
        this.powRatio = this.item.pow;
        this.hpRatio = this.item.hp;
        this.pts = this.item.pts;
        this.smithCost = this.item.smithCost;
    }
    uniqueId() {
        return `${this.id}_${this.rarity}_${this.sharp}`;
    }
    pow() {
        const sharp = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 0;
        const ratio = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;
        return this.statCalc(Math.max(0, this.powRatio + ratio) * this.pts, sharp);
    }
    hp() {
        const sharp = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 0;
        const ratio = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;
        return this.statCalc(Math.max(0, 9 * (this.hpRatio + ratio)) * this.pts, sharp);
    }
    statCalc(flat, sharp) {
        const add = sharp ? 1 : 0;
        return Math.floor(flat * miscData.rarityMod[this.rarity] * (1 + 0.05 * (this.sharp + add)));
    }
    transform() {
        if(this.powRatio === 3) {
            this.powRatio = 0;
            this.hpRatio = 3;
        } else {
            this.powRatio = 3;
            this.hpRatio = 3;
        }
    }
    setSynth(type) {
        if(type === 'pow') {
            this.powRatio = 3;
            this.hpRatio = 0;
        } else {
            this.powRatio = 0;
            this.hpRatio = 3;
        }
    }
}

class RecipeManager {
    constructor(items) {
        this.items = [];
        for(let item of items) {
            this.items.push(new Item(item));
        }
    }
    byId(id) {
        return this.items.find(i => i.id === id);
    }
    byLevel(level) {
        return this.items.filter(i => i.lvl === level);
    }
    byType(type) {
        return this.items.filter(i => i.type === type);
    }
    byLevelType(level, type) {
        return this.items.find(i => i.lvl == level && i.type == type);
    }
}

class Skill {
    constructor(props) {
        Object.assign(this, props);
    }
    passiveCheck(type, target, attack) {
        skillList.skillEffects[this.id](type, target, attack, this);
    }
}

class SkillManager {
    constructor(skills) {
        this.skills = [];
        this.skillEffects = {};
        for(let skill of skills) {
            this.skills.push(new Skill(skill));
        }
        this.setEffects();
    }
    byId(id) {
        return this.skills.find(s => s.id === id);
    }
    setEffects() {
        this.skillEffects.S0000 = (round) => {
            const targets = round.getTarget(TargetType.first, SideType.enemies, true);
            for(const target of targets) target.takeAttack(round);
        }
        this.skillEffects.S0010 = (round) => {
            const targets = round.getTarget(TargetType.self, SideType.allies);
            for(const target of targets) buffList.generateBuff('B0010', target, round.attack.mod1);
        }
        this.skillEffects.S0011 = (round) => {
            const targets = round.getTarget(TargetType.self, SideType.allies);
            for(const target of targets) buffList.generateBuff('B0011', target, round.power);
        }
        this.skillEffects.S0012 = (round) => {
            const targets = round.getTarget(TargetType.behind, SideType.allies);
            if(targets === null) return;
            for(const target of targets) buffList.generateBuff('B0012', target, round.attack.mod1);
        }
        this.skillEffects.S0020 = (round) => {
            const targets = round.getTarget(TargetType.self, SideType.allies);
            for(const target of targets) {
                if(target.getBuffStacks('B0020') === 5) return;
                buffList.generateBuff('B0020', target, round.power);
                target.heal(round.power);
            }
        }
        this.skillEffects.S0021 = (round) => {
            const targets = round.getTarget(TargetType.self, SideType.allies);
            for(const target of targets) buffList.generateBuff('B0021', target);
        }
        this.skillEffects.S0022 = (round) => {
            const targets = round.getTarget(TargetType.self, SideType.allies);
            for(const target of targets) {
                if(target.getBuffStacks('B0022') === 5) return;
                buffList.generateBuff('B0022', target, round.attack.mod1, round.attack.mod2);
            }
        }
        this.skillEffects.S0030 = (round) => {
            const targets = round.getTarget(TargetType.self, SideType.allies);
            for(const target of targets) target.takeDamagePercent(round.attack.mod1 * 100);
            const targets2 = round.getTarget(TargetType.first, SideType.enemies);
            for(const target of targets2) target.takeAttack(round);
        }
        this.skillEffects.S0031 = (round) => {
            const targets = round.getTarget(TargetType.first, SideType.enemies);
            const self = round.getTarget(TargetType.self, SideType.allies)[0];
            for(const target of targets) {
                target.takeAttack(round);
                if(target.isLifeTapped()) {
                    self.heal(Math.floor(round.power * round.attack.mod1));
                }
            }
        }
        this.skillEffects.S0032 = (round) => {
            const targets = round.getTarget(TargetType.self, SideType.allies);
            for(const target of targets) target.takeDamagePercent(round.attack.mod1 * 100);
            const targets2 = round.getTarget(TargetType.cleave, SideType.enemies);
            for(const target of targets2) target.takeAttack(round);
        }
        this.skillEffects.S0040 = (round) => {
            const targets = round.getTarget(TargetType.cleave, SideType.enemies);
            for(const target of targets) target.takeAttack(round);
        }
        this.skillEffects.S0041 = (round) => {
            const targets = round.getTarget(TargetType.first, SideType.enemies);
            const self = round.getTarget(TargetType.self, SideType.allies)[0];
            round.power -= Math.floor(round.power * round.attack.mod1 * self.getBuffStacks('B0041'));
            for(const target of targets) target.takeAttack(round);
            buffList.generateBuff('B0041', self, 0);
        }
        this.skillEffects.S0042 = (round) => {
            const targets = round.getTarget(TargetType.first, SideType.enemies);
            const self = round.getTarget(TargetType.self, SideType.allies)[0];
            buffList.generateBuff('B0042', self, Math.floor(self.getPow() * round.attack.mod1));
            for(const target of targets) target.takeAttack(round);
        }
        this.skillEffects.S1010 = (round) => {
            const targets = round.getTarget(TargetType.all, SideType.enemies);
            for(const target of targets) {
                target.takeAttack(round);
                buffList.generateBuff('B1010', target, Math.floor(round.power * round.attack.mod1));
            }
        }
        this.skillEffects.S1011 = (round) => {
            const targets = round.getTarget(TargetType.first, SideType.enemies);
            for(const target of targets) {
                target.takeAttack(round);
                buffList.generateBuff('B1010', target, Math.floor(round.power * round.attack.mod1));
            }
        }
        this.skillEffects.S1012 = (round) => {
            const targets = round.getTarget(TargetType.first, SideType.enemies);
            for(const target of targets) {
                if(target.getBuffStacks('B1012') === 2) {
                    target.takeDamage(target.getBuff('B1012').power);
                    buffList.removeBuff('B1012', target);
                    return;
                }
                buffList.generateBuff('B1012', target, Math.floor(round.power));
            }
        }
        this.skillEffects.S1020 = (round) => {
            const targets = round.getTarget(TargetType.first, SideType.enemies);
            const power = round.power;
            for(const target of targets) {
                if(target.isChilled()) {
                    round.power = Math.floor(round.attack.mod1 * power);
                    target.takeAttack(round);
                } else {
                    target.takeAttack(round);
                    buffList.generateBuff('B1020', target, 0);
                }
            }
        }
        this.skillEffects.S1021 = (round) => {
            const targets = round.getTarget(TargetType.all, SideType.enemies);
            for(const target of targets) {
                target.takeAttack(round);
                buffList.generateBuff('B1020', target, 0);
            }
        }
        this.skillEffects.S1022 = (round) => {
            const targets = round.getTarget(TargetType.self, SideType.allies);
            for(const target of targets) {
                target.takeAttack(round);
                buffList.generateBuff('B1022', target, 0);
            }
        }
        this.skillEffects.S1030 = (round) => {
            const targets = round.getTarget(TargetType.before, SideType.allies, true);
            if(targets === null || targets[0] === undefined || targets[0].race === 'undead') return;
            for(const target of targets) target.takeAttack(round);
            const targets2 = round.getTarget(TargetType.mirror, SideType.enemies);
            for(const target of targets2) buffList.generateBuff('B1030', target, Math.floor(round.power * round.attack.mod1));
        }
        this.skillEffects.S1031 = (round) => {
            const targets = round.getTarget(TargetType.after, SideType.allies, true);
            if(targets === null || targets[0] === undefined || targets[0].race === 'undead') return;
            for(const target of targets) target.takeAttack(round);
            const targets2 = round.getTarget(TargetType.mirror, SideType.enemies);
            for(const target of targets2) buffList.generateBuff('B1030', target, Math.floor(round.power * round.attack.mod1));
        }
        this.skillEffects.S1032 = (round) => {
            const targets = round.getTarget(TargetType.all, SideType.allies, true);
            for(const target of targets.filter(t => t.race !== 'undead')) buffList.generateBuff('B1030', target, Math.floor(round.power * round.attack.mod1));
            const targets2 = round.getTarget(TargetType.all, SideType.enemies);
            for(const target of targets2) buffList.generateBuff('B1030', target, Math.floor(round.power * round.attack.mod1));
        }
        this.skillEffects.S1040 = (round) => {
            const targets = round.getTarget(TargetType.missingHP, SideType.allies);
            for(const target of targets) target.heal(round.power);
        }
        this.skillEffects.S1041 = (round) => {
            const targets = round.getTarget(TargetType.all, SideType.allies);
            for(const target of targets) target.heal(round.power);
        }
        this.skillEffects.S1042 = (round) => {
            const targets = round.getTarget(TargetType.first, SideType.allies);
            for(const target of targets) buffList.generateBuff('B1042', target, round.power);
        }
        this.skillEffects.S2010 = (round) => {
            const targets = round.getTarget(TargetType.all, SideType.allies);
            for(const target of targets) {
                const stacks = target.getBuffStacks('B2010');
                const needHeal = stacks < buffList.maxStack('B2010');
                buffList.generateBuff('B2010', target, Math.floor(round.power));
                if(!needHeal) return;
                target.heal(round.power);
            }
        }
        this.skillEffects.S2011 = (round) => {
            const targets = round.getTarget(TargetType.all, SideType.allies);
            for(const target of targets) buffList.generateBuff('B2011', target, Math.floor(round.power));
        }
        this.skillEffects.S2012 = (round) => {
            const targets = round.getTarget(TargetType.all, SideType.allies);
            for(const target of targets) buffList.generateBuff('B2012', target, Math.floor(round.power));
        }
        this.skillEffects.S2020 = (round) => {
            const targets = round.getTarget(TargetType.lowestHP, SideType.enemies);
            for(const target of targets) {
                const power = round.power;
                if(target.maxHP() * round.attack.mod1 >= target.hp) {
                    round.power = Math.floor(round.power * round.attack.mod2);
                }
                target.takeAttack(round);
                round.power = power;
            }
        };
        this.skillEffects.S2021 = (round) => {
            const targets = round.getTarget(TargetType.third, SideType.enemies);
            for(const target of targets) {
                const power = round.power;
                if(target.hasBuff('B1010')) {
                    round.power = Math.floor(round.power * round.attack.mod1);
                    buffList.removeBuff('B1010', target);
                }
                target.takeAttack(round);
                round.power = power;
            }
        };
        this.skillEffects.S2022 = (round) => {
            const targets = round.getTarget(TargetType.fourth, SideType.enemies);
            for(const target of targets) {
                const power = round.power;
                if(target.maxHP() === target.hp) {
                    round.power = Math.floor(round.power * round.attack.mod1);
                }
                target.takeAttack(round);
                round.power = power;
            }
        };
        this.skillEffects.S2030 = (round) => {
            const targets = round.getTarget(TargetType.first, SideType.enemies);
            for(const target of targets) {
                target.takeAttack(round);
                target.takeAttack(round);
            }
        };
        this.skillEffects.S2031 = (round) => {
            const targets = round.getTarget(TargetType.second, SideType.enemies);
            for(const target of targets) {
                const power = round.power;
                if(target.isChilled()) {
                    round.power = Math.floor(round.power * round.attack.mod1);
                }
                target.takeAttack(round);
                round.power = power;
            }
        };
        this.skillEffects.S2032 = (round) => {
            const targets = round.getTarget(TargetType.first, SideType.enemies);
            for(const target of targets) {
                const power = round.power;
                if(round.attacker.hp % 10 === 7) {
                    round.power = Math.floor(round.power * round.attack.mod1);
                }
                target.takeAttack(round);
                round.power = power;
            }
        };
        this.skillEffects.S2040 = (round) => {
            const targets = round.getTarget(TargetType.second, SideType.enemies);
            for(const target of targets) {
                buffList.generateBuff('B2040', target, 0);
                target.takeAttack(round);
            }
        };
        this.skillEffects.S2041 = (round) => {
            const targets = round.getTarget(TargetType.third, SideType.enemies);
            for(const target of targets) {
                buffList.generateBuff('B2040', target, 0);
                target.takeAttack(round);
            }
        };
        this.skillEffects.S2042 = (round) => {
            const targets = round.getTarget(TargetType.fourth, SideType.enemies);
            for(const target of targets) {
                buffList.generateBuff('B2040', target, 0);
                target.takeAttack(round);
            }
        };
        this.skillEffects.SM100 = (round) => {
            const targets = round.getTarget(TargetType.first, SideType.enemies);
            for(const target of targets) target.takeAttack(round);
            const targets2 = round.getTarget(TargetType.all, TargetType.allies);
            for(const target of targets2) target.heal(round.power);
        };
        this.skillEffects.SM101 = (round) => {
            const targets = round.getTarget(TargetType.self, TargetType.allies);
            for(const target of targets) target.heal(round.power);
        };
        this.skillEffects.SM102 = (round) => {
            const targets = round.getTarget(TargetType.first, SideType.enemies);
            for(const target of targets) {
                target.takeAttack(round);
                buffList.generateBuff('BM102', target, round.power);
            }
        };
        this.skillEffects.SM103 = (round) => {
            const targets = round.getTarget(TargetType.first, SideType.enemies);
            const self = round.getTarget(TargetType.self, SideType.allies)[0];
            if(self.hp === self.maxHP()) {
                round.power = Math.floor(round.power * round.attack.mod1);
            }
            for(const target of targets) target.takeAttack(round);
        };
        this.skillEffects.SM104 = (round) => {
            const targets = round.getTarget(TargetType.first, SideType.enemies);
            for(const target of targets) {
                const power = round.power;
                if(target.buffCount() > 0) {
                    round.power = Math.floor(round.power * round.attack.mod1);
                }
                target.takeAttack(round);
                round.power = power;
            }
        };
        this.skillEffects.SM105 = (round) => {
            const targets = round.getTarget(TargetType.self, SideType.allies);
            for(const target of targets) {
                const power = round.power;
                if(target.maxHP() & round.attack.mod1 >= target.hp) {
                    round.power = Math.floor(round.power * round.attack.mod2);
                }
                target.heal(round.power);
                round.power = power;
            }
        };
        this.skillEffects.SM106 = (round) => {
            const targets = round.getTarget(TargetType.all, SideType.allies);
            for(const target of targets) {
                if(target.debuffCount() > 0) target.heal(round.power);
                target.removeDebuffs();
            }
        };
        this.skillEffects.SM107 = (round) => {
            if(round.attacker.hpLessThan(round.attack.mod1)) round.power = Math.floor(round.power * round.attack.mod2);
            const targets = round.getTarget(TargetType.first, SideType.enemies);
            for(const target of targets) target.takeAttack(round);
        };
        this.skillEffects.SM108 = (round) => {
            const targets = round.getTarget(TargetType.adjacent, SideType.allies);
            for(const target of targets) target.heal(round.power);
        };
        this.skillEffects.SM109 = (round) => {
            const targets = round.getTarget(TargetType.fourth, SideType.enemies);
            for(const target of targets) {
                const power = round.power;
                if(target.hpLessThan(round.attack.mod1)) {
                    round.power = Math.floor(round.power * round.attack.mod2);
                }
                target.heal(round.power);
                round.power = power;
            }
        };
        this.skillEffects.SM200 = (round) => {
            const targets = round.getTarget(TargetType.self, SideType.allies);
            for(const target of targets) buffList.generateBuff('BM200', target, round.power);
        };
        this.skillEffects.SM201 = (round) => {
            const targets = round.getTarget(TargetType.all, SideType.allies);
            const count = targets.reduce((acc, t) => acc + t.debuffCount(), 0);
            const power = round.power;
            for(const target of targets) target.removeDebuffs();
            if(count > 0) {
                const targets = round.getTarget(TargetType.first, SideType.enemies);
                round.power = Math.floor(power * count);
                for(const target of targets) target.takeAttack(round);
            }
        };
        this.skillEffects.SM202 = (round) => {
            const targets = round.getTarget(TargetType.first, SideType.enemies);
            const power = round.power;
            for(const target of targets) {
                if(target.hpLessThan(round.attack.mod1)) round.power = Math.floor(power * round.attack.mod2);
                else round.power = power;
                target.takeAttack(round);
            }
        };
        this.skillEffects.SM203 = (round) => {
            const targets = round.getTarget(TargetType.missingHP, SideType.allies);
            for(const target of targets) target.heal(round.power);
        };
        this.skillEffects.SM204 = (round) => {
            const targets = round.getTarget(TargetType.all, SideType.enemies);
            for(const target of targets) target.takeDamage(round.power);
        };
        this.skillEffects.SM205 = (round) => {
            const targets = round.getTarget(TargetType.self, SideType.allies);
            for(const target of targets) buffList.generateBuff('BM205', target, round.power);
        };
        this.skillEffects.SM206 = (round) => {
            const targets = round.getTarget(TargetType.all, SideType.allies);
            const self = round.getTarget(TargetType.self, SideType.allies)[0];
            if(self.hp === self.maxHP()) {
                round.power = Math.floor(round.power * round.attack.mod1);
            }
            for(const target of targets) target.heal(round.power);
        };
        this.skillEffects.SM207 = (round) => {
            const targets = round.getTarget(TargetType.all, SideType.enemies);
            for(const target of targets.filter(t => t.hp === t.maxHP())) target.takeDamagePercent(round.attack.mod1 * 100);
        };
        this.skillEffects.SM208 = (round) => {
            const targets = round.getTarget(TargetType.all, SideType.allies);
            for(const target of targets) buffList.generateBuff('BM208', target, round.power);
        };
        this.skillEffects.SM209 = (round) => {
            const targets = round.getTarget(TargetType.all, SideType.enemies);
            for(const target of targets) {
                const power = round.power;
                if(target.maxHP() === target.hp) {
                    round.power = Math.floor(round.power * round.attack.mod1);
                }
                target.takeAttack(round);
                round.power = power;
            }
        };
        this.skillEffects.SM300 = (round) => {
            const targets = round.getTarget(TargetType.first, SideType.enemies);
            for(const target of targets) target.takeAttack(round);
        };
        this.skillEffects.SM301 = (round) => {
            const targets = round.getTarget(TargetType.first, SideType.enemies);
            for(const target of targets) {
                round.power = Math.floor(target.maxHP() * round.attack.mod1);
                target.takeAttack(round);
            }
        };
        this.skillEffects.SM302 = (round) => {
            const targets = round.getTarget(TargetType.fourth, SideType.enemies);
            for(const target of targets) target.takeAttack(round);
        };
        this.skillEffects.SM303 = (round) => {
            const targets = round.getTarget(TargetType.self, SideType.allies);
            const count = round.getTarget(TargetType.all, SideType.allies).length - 1;
            round.power = Math.floor(round.power * (1 + 0.5 * count));
            for(const target of targets) target.heal(round.power);
        };
        this.skillEffects.SM304 = (round) => {
            const targets = round.getTarget(TargetType.adjacent, SideType.allies);
            for(const target of targets) buffList.generateBuff('BM304', target, round.power);
        };
        this.skillEffects.SM305 = (round) => {
            const targets = round.getTarget(TargetType.self, SideType.allies);
            for(const target of targets) buffList.generateBuff('BM305', target, round.power);
        };
        this.skillEffects.SM306 = (round) => {
            const targets = round.getTarget(TargetType.all, SideType.enemies);
            const self = round.getTarget(TargetType.self, SideType.allies)[0];
            for(const target of targets) target.takeAttack(round);
            self.takeDamagePercent(100);
        };
        this.skillEffects.SM307 = (round) => {
            const targets = round.getTarget(TargetType.lowestHP, SideType.enemies);
            for(const target of targets) target.takeAttack(round);
        };
        this.skillEffects.SM308 = (round) => {
            const targets = round.getTarget(TargetType.BEFORE, SideType.allies);
            for(const target of (targets || [])) target.heal(round.power);
        };
        this.skillEffects.SM309 = (round) => {
            const targets = round.getTarget(TargetType.all, SideType.enemies);
            const self = round.getTarget(TargetType.self, SideType.allies)[0];
            if(self.hp !== self.maxHP()) {
                round.power = Math.floor(round.power * round.attack.mod1);
            }
            for(const target of targets) target.takeAttack(round);
        };
        this.skillEffects.SM901 = (round) => {
            const targets = round.getTarget(TargetType.second, SideType.enemies);
            for(const target of targets) target.takeAttack(round);
        };
        this.skillEffects.SM902 = (round) => {
            const targets = round.getTarget(TargetType.first, SideType.enemies);
            for(const target of targets) target.takeAttack(round);
            const targets2 = round.getTarget(TargetType.second, SideType.enemies);
            for(const target of targets2) if(target !== undefined) target.takeAttack(round);
        };
        this.skillEffects.SM903 = (round) => {
            const targets = round.getTarget(TargetType.all, SideType.enemies);
            const hp = Math.floor(targets.reduce((acc, t) => acc + t.hp, 0) / targets.length);
            for(const target of targets) target.setHP(hp);
        };
        this.skillEffects.SM904 = (round) => {
            const targets = round.getTarget(TargetType.all, SideType.enemies);
            for(const target of targets) {
                round.power = Math.ceil(target.maxHP() * 0.02);
                target.takeAttack(round);
            }
        };
        this.skillEffects.SM904D = (round) => {
            const targets = round.getTarget(TargetType.twoLeastMax, SideType.enemies);
            for(const target of targets) target.takeAttack(round);
        };
        this.skillEffects.SM904A = (round) => {
            const targets = round.getTarget(TargetType.all, SideType.enemies);
            for(const target of targets) target.takeAttack(round);
        };
        this.skillEffects.SM904B = (round) => {
            const self = round.getTarget(TargetType.self, SideType.allies)[0];
            buffList.clearBuffs(self);
            self.healPercent(100);
            self.state = null;
            self.playbook = playbookList.generate(['S0000','S0000','S0000','SM904A']);
        };
        this.skillEffects.SM904C = (round) => {};
        this.skillEffects.SM905A = (round) => {
            const targets = round.getTarget(TargetType.enemies, SideType.enemies);
            const self = round.getTarget(TargetType.self, SideType.allies)[0];
            if(self.toTarget === undefined || self.toTarget === targets.length - 1) self.toTarget = 0;
            else self.toTarget++;
            const target = targets[self.toTarget];
            target.takeAttack(round);
            if(target.type === "Might") {
                buffList.generateBuff('BM905A', self, round.power);
            } else if (target.type === "Mind") {
                buffList.generateBuff('BM905B', self, round.power);
            } else if (target.type === "Moxie") {
                buffList.generateBuff('BM905C', self, round.power);
            }
        };
        this.skillEffects.SM905B = (round) => {
            const self = round.getTarget(TargetType.self, SideType.allies)[0];
            if(self.hasBuff('BM905A')) {
                buffList.removeBuff('BM905A', self);
                buffList.generateBuff('BM905D', self, round.power);
            } else if(self.hasBuff('BM905B')) {
                const stacks = self.getBuffStacks('BM905E');
                buffList.removeBuff('BM905B', self);
                const heal = Math.floor(round.power * (1 + stacks * 0.1));
                self.heal(heal);
                buffList.generateBuff('BM905E', self, round.power);
            } else if(self.hasBuff('BM905C')) {
                buffList.removeBuff('BM905C', self);
                const targets = round.getTarget(TargetType.first, SideType.enemies);
                for(const target of targets) buffList.generateBuff('BM905F', target, round.power);
            }
        };
        this.skillEffects.SM906 = (round) => {
            const targets = round.getTarget(TargetType.all, SideType.enemies);
            for(const target of targets) {
                target.takeAttack(round);
                buffList.generateBuff('BM906', target, round.power);
            }
        };
        this.skillEffects.SM906A = (round) => {};
        this.skillEffects.SM906B = (round) => {
            const self = round.getTarget(TargetType.self, SideType.allies)[0];
            self.state = null;
            self.playbook = playbookList.generate([self.skill1, self.skill2, self.skill3, self.skill4]);
            buffList.removeBuff('BM906A', self);
            buffList.generateBuff('BM906B', self, 0);
            self.healPercent(100);
        };
        this.skillEffects.SM907A = (round) => {
            const targets = round.getTarget(TargetType.first, SideType.enemies);
            const self = round.getTarget(TargetType.self, SideType.allies)[0];
            const stacks = self.getBuffStacks('BM907');
            for(const target of targets) target.takeAttack(round);
            const targets2 = round.getTarget(TargetType.all, SideType.enemies);
            round.power += round.power * stacks * round.attack.mod1;
            for(const target of targets2) target.takeAttack(round);
        };
        this.skillEffects.SM907B = (round) => {
            const targets = round.getTarget(TargetType.first, SideType.enemies);
            const self = round.getTarget(TargetType.self, SideType.allies)[0];
            const stacks = self.getBuffStacks('BM907');
            for(const target of targets) target.takeAttack(round);
            round.power += round.power * stacks * round.attack.mod1;
            self.heal(Math.floor(round.power));
        };
        this.skillEffects.SM907C = (round) => {};
        this.skillEffects.SM907D = (round) => {
            const self = round.getTarget(TargetType.self, SideType.allies)[0];
            buffList.generateBuff('BM907', self, 0);
        };
        this.skillEffects.SM908 = (round) => {
            const targets = round.getTarget(TargetType.all, SideType.enemies);
            for(const target of targets) { 
                target.takeAttack(round);
                round.power = round.power * round.attack.mod1;
            }
        };
        this.skillEffects.SM908A = (round) => {
            const targets = round.getTarget(TargetType.random, SideType.enemies);
            for(const target of targets) buffList.generateBuff('BM908A', target, round.attack.mod1);
        };
        this.skillEffects.SM908B = (round) => {
            const self = round.getTarget(TargetType.self, SideType.allies)[0];
            buffList.generateBuff('BM908B', self, round.attack.mod1);
        };
        this.skillEffects.SM909A = (round) => {
            const targets = round.getTarget(TargetType.first, SideType.enemies);
            const self = round.getTarget(TargetType.self, SideType.allies)[0];
            const stacks = self.getBuffStacks('BM909');
            for(const target of targets) {
                const power = round.power;
                if(self.hasBuff('BM909A1') && target.type === 'Might')
                    round.power = round.power * round.attack.mod1;
                else if (self.hasBuff('BM909B1') && target.type === 'Mind')
                    round.power = round.power * round.attack.mod1;
                else if (self.hasBuff('BM909C1') && target.type === 'Moxie')
                    round.power = round.power * round.attack.mod1;
                for(let i = 0; i <= stacks; i++) {
                    target.takeAttack(round);
                }
                round.power = power;
            }
        }
        this.skillEffects.SM909B = (round) => {
            let targets = round.getTarget(TargetType.first, SideType.enemies);
            const self = round.getTarget(TargetType.self, SideType.allies)[0];
            const stacks = self.getBuffStacks('BM909');
            if(stacks === 1) {
                targets = round.getTarget(TargetType.cleave, SideType.enemies);
            } else if (stacks === 2) {
                targets = round.getTarget(TargetType.swipe, SideType.enemies);
            } else if (stacks === 3) {
                targets = round.getTarget(TargetType.all, SideType.enemies);
            }

            for(const target of targets) {
                const power = round.power;
                if(self.hasBuff('BM909A1') && target.type === 'Might')
                    round.power = round.power * round.attack.mod1;
                else if (self.hasBuff('BM909B1') && target.type === 'Mind')
                    round.power = round.power * round.attack.mod1;
                else if (self.hasBuff('BM909C1') && target.type === 'Moxie')
                    round.power = round.power * round.attack.mod1;
                target.takeAttack(round);
                round.power = power;
            }
        }
        this.skillEffects.SM909C = (round) => {
            let targets = round.getTarget(TargetType.first, SideType.enemies);
            const self = round.getTarget(TargetType.self, SideType.allies)[0];
            if(self.hasBuff('BM909C1')) {
                targets = round.getTarget(TargetType.lowestHP, SideType.enemies);
            }

            for(const target of targets) {
                const power = round.power;
                if(self.hasBuff('BM909A1') && target.type === 'Might')
                    round.power = round.power * round.attack.mod1;
                else if (self.hasBuff('BM909B1') && target.type === 'Mind')
                    round.power = round.power * round.attack.mod1;
                else if (self.hasBuff('BM909C1') && target.type === 'Moxie')
                    round.power = round.power * round.attack.mod1;
                target.takeAttack(round);
                round.power = power;
            }
        }
        this.skillEffects.SM909A1 = (round) => {
            let targets = round.getTarget(TargetType.firstMoxie, SideType.enemies);
            if(targets !== undefined) {
                round.power = round.power * round.attack.mod1;
            } else {
                targets = round.getTarget(TargetType.first, SideType.enemies);
            }
            for(const target of targets) target.takeAttack(round);
        }
        this.skillEffects.SM909A2 = (round) => {
            const targets = round.getTarget(TargetType.cleave, SideType.enemies);
            for(const target of targets) target.takeAttack(round);
        }
        this.skillEffects.SM909B1 = (round) => {
            const targets = round.getTarget(TargetType.all, SideType.enemies);
            for(const target of targets) {
                const power = round.power;
                if(target.type === 'Might') round.power = round.power * round.attack.mod1;
                target.takeAttack(round);
                round.power = power;
            }
        }
        this.skillEffects.SM909B2 = (round) => {
            let targets = round.getTarget(TargetType.all, SideType.allies);
            for(const target of targets) target.heal(round.power);
        }
        this.skillEffects.SM909C1 = (round) => {
            const targets = round.getTarget(TargetType.lowestHP, SideType.enemies);
            for(const target of targets) {
                const power = round.power;
                if(target.type === 'Mind') round.power = round.power * round.attack.mod1;
                target.takeAttack(round);
                round.power = power;
            }
        }
        this.skillEffects.SM909C2 = (round) => {
            let targets = round.getTarget(TargetType.all, SideType.enemies);
            for(const target of targets) buffList.generateBuff('BM909C3', target, round.power);
        }
        this.skillEffects.SM910A = (round) => {
            let targets = round.getTarget(TargetType.all, SideType.enemies);
            for(const target of targets) buffList.generateBuff('BM909C3', target, round.power);
        }
        this.skillEffects.SMP902 = (type, self, attack, skillParams) => {
            if(type !== 'initial') return;
            buffList.generateBuff('BM902', self, Math.floor(skillParams.powMod * self.pow));
        }
        this.skillEffects.SMP904A = (type, self, attack, skillParams) => {
            if(type !== 'dead' || self.state !== null) return;
            if(self.dungeon.mobs.find(m => m.id === 'B904').dead()) return;
            self.state = 'bones';
            self.hp = 1;
            self.playbook = playbookList.generate(['SM904C','SM904C','SM904C','SM904B']);
            buffList.generateBuff('BM904A', self, 0);
        }
        this.skillEffects.SMP906 = (type, self, attack, skillParams) => {
            if(type !== 'onTurn') return;
            if(self.hp > self.maxHP() / 4 || self.state !== null) return;
            self.state = 'egg';
            self.playbook = playbookList.generate(['SM906A','SM906A','SM906A','SM906B']);
            buffList.generateBuff('BM906A', self, 0);
        }
        this.skillEffects.SMP907 = (type, self, attack, skillParams) => {
            if(type === 'initial') buffList.generateBuff('BM907B', self, skillParams.powMod * self.pow);
            if(type === 'onHit') {
                const stacks = self.getBuffStacks('BM907B');
                if(!self.hpLessThan(0.25 * stacks)) return;
                buffList.clearDebuffs(self);
                self.buffTick('custom');
                self.state = 'tree';
                self.playbook = playbookList.generate(['SM907C','SM907D','SM907C','SM907D']);
                buffList.generateBuff('BM907C', self);
                const position = self.dungeon.order.positionInParty();
                for(let i = 0; i < 3; i++) {
                    self.dungeon.addMob('B907A', i < position, false);
                }
            }
            if(type === 'treeBuffGone') {
                self.state = null;
                self.playbook = playbookList.generate(['SM907A','S0000','SM907A','SM907B']);
                for(const tree of self.dungeon.mobs.filter(m => m.id === 'B907A')) {
                    self.dungeon.removeMob(tree.uniqueid, false);
                }
            }
        }
        this.skillEffects.SMP907A = (type, self, attack, skillParams) => {
            if(type !== 'initial') return;
            buffList.generateBuff('BM907A', self, skillParams.powMod * self.pow);
            self.hp = self.hpMod;
            self.hpmax = self.hpMod;
        }
        this.skillEffects.SMP909A = (type, self, attack, skillParams) => {
            if(type === 'initial') buffList.generateBuff('BM909A2', self, 1);
            if(type !== 'dead') return;
            const goblinKing = self.dungeon.mobs.find(m => m.id === 'B909');
            buffList.generateBuff('BM909A1', goblinKing, skillParams.mod1 * 100);
            buffList.removeBuff('BM909B1', goblinKing);
            buffList.removeBuff('BM909C1', goblinKing);
            buffList.generateBuff('BM909', goblinKing, 1);
        }
        this.skillEffects.SMP909B = (type, self, attack, skillParams) => {
            if(type === 'initial') buffList.generateBuff('BM909B2', self, 1);
            if(type !== 'dead') return;
            const goblinKing = self.dungeon.mobs.find(m => m.id === 'B909');
            buffList.removeBuff('BM909A1', goblinKing);
            buffList.generateBuff('BM909B1', goblinKing, skillParams.mod1 * 100, skillParams.mod2 * 100);
            buffList.removeBuff('BM909C1', goblinKing);
            buffList.generateBuff('BM909', goblinKing, 1);
        }
        this.skillEffects.SMP909C = (type, self, attack, skillParams) => {
            if(type === 'initial') buffList.generateBuff('BM909C2', self, 1);
            if(type !== 'dead') return;
            const goblinKing = self.dungeon.mobs.find(m => m.id === 'B909');
            buffList.removeBuff('BM909A1', goblinKing);
            buffList.removeBuff('BM909B1', goblinKing);
            buffList.generateBuff('BM909C1', goblinKing, skillParams.mod1 * 100);
            buffList.generateBuff('BM909', goblinKing, 1);
        }
        this.skillEffects.SMP909 = (type, self, attack, skillParams) => {
            if(type !== 'dead') return;
            for(const goblin of self.dungeon.mobs.filter(m => m.alive())) {
                buffList.removeBuff('BM909A2', goblin);
                buffList.removeBuff('BM909B2', goblin);
                buffList.removeBuff('BM909C2', goblin);
            }
        }
    }
}

class Playbook {
    constructor(template) {
        Object.assign(this, template);
        this.skills = [
            skillList.byId(this.skill1),
            skillList.byId(this.skill2),
            skillList.byId(this.skill3),
            skillList.byId(this.skill4)
        ];
        this.skillId = this.skills.map(s => s.id);
        this.position = 0;
    }
    reset() {
        this.position = 0;
    }
    nextSkill() {
        let result = this.skills[this.position];
        this.position++;
        if(this.position === 4) this.position = 0;
        return result;
    }
    getSkillIds() {
        return this.skills.map(s => s.id);
    }
}

class PlaybookManager {
    constructor(list) {
        this.templates = [];
        for(let item of list) {
            this.templates.push(item);
        }
    }
    byId(id) {
        return this.templates.find(p => p.id === id);
    }
    bySkillId(skillId) {
        let index = this.templates.findIndex(p => p.skillId === skillId.join());
        if(index > -1) {
            return this.templates[index];
        } else {
            let template = {skillId: skillId.join(), skill1: skillId[0], skill2: skillId[1], skill3: skillId[2], skill4: skillId[3]};
            this.templates.push(template);
            return template;
        }
    }
    generate(id) {
        return new Playbook(this.byId(id) || this.bySkillId(id));
    }
}

class Buff {
    constructor(template, target, power, power2) {
        Object.assign(this, template);
        this.stacks = this.stackCast;
        this.target = target;
        this.power = power;
        this.power2 = power2;
    }
    addCast() {
        if(this.onCast === 'refresh') {
            this.stacks = this.stackCast;
        } else if (this.onCast === 'stack') {
            this.stacks = Math.min(this.stacks + this.stackCast, this.maxStack);
        }
    }
    buffTick(type, attack) {
        if(type === 'onMyTurn') this.onTick();
        if(type === 'onHit') this.onHit(attack);
        if(type === 'onHitting') this.onHitting();
        if(type !== this.decrease) return;
        this.stacks -= 1;
        if(this.stacks <= 0) this.expire();
    }
    expired() {
        return this.stacks <= 0;
    }
    onTick() {
        return;
    }
    onHit() {
        return;
    }
    onHitting() {
        return;
    }
    getPow() {
        return 0;
    }
    getPowPercent() {
        return 0;
    }
    isChilled() {
        return false;
    }
    isWilt() {
        return false;
    }
    isLifeTapped() {
        return false;
    }
    getProtection() {
        return 0;
    }
    getVulnerability() {
        return 0;
    }
    maxHP() {
        return 0;
    }
    maxHPPercent() {
        return 0;
    }
    mark() {
        return false;
    }
    phase() {
        return false;
    }
    debuffImmune() {
        return false;
    }
    thorns() {
        return 0;
    }
    parry() {
        return 0;
    }
    beornTank() {
        return 0;
    }
    expire() {
        return;
    }
    confusion() {
        return false;
    }
}

class B0010 extends Buff {
    constructor(template, target, power) {
        super(template, target, power);
    }
    getProtection() {
        return this.power;
    }
}

class B0011 extends Buff {
    constructor(template, target, power) {
        super(template, target, power);
    }
    parry() {
        return this.power;
    }
    getProtection() {
        return 1;
    }
}

class B0012 extends Buff {
    constructor(template, target, power) {
        super(template, target, power);
    }
    beornTank() {
        return 1 - this.power;
    }
    getProtection() {
        return this.power;
    }
}

class B0020 extends Buff {
    constructor(template, target, power) {
        super(template, target, power);
    }
    maxHP() {
        return this.power * this.stacks;
    }
}

class B0021 extends Buff {
    constructor(template, target, power) {
        super(template, target, power);
    }
    mark() {
        return true;
    }
}

class B0022 extends Buff {
    constructor(template, target, power, power2) {
        super(template, target, power, power2);
    }
    maxHPPercent() {
        return -this.power * this.stacks;
    }
    getPowPercent() {
        return this.power2 * this.stacks;
    }
}

class B0041 extends Buff {
    constructor(template, target, power) {
        super(template, target, power);
    }
}

class B0042 extends Buff {
    constructor(template, target, power) {
        super(template, target, power);
    }
    getPow() {
        return this.power * this.stacks;
    }
}

class B1010 extends Buff {
    constructor(template, target, power) {
        super(template, target, power);
    }
    onHitting() {
        this.target.takeDamage(this.power);
    }
}

class B1012 extends Buff {
    constructor(template, target, power) {
        super(template, target, power);
    }
}

class B1020 extends Buff {
    constructor(template, target, power) {
        super(template, target, power);
    }
    isChilled() {
        return true;
    }
}

class B1022 extends Buff {
    constructor(template, target, power) {
        super(template, target, power);
    }
    getProtection() {
        return 1;
    }
}

class B1030 extends Buff {
    constructor(template, target, power) {
        super(template, target, power);
    }
    onTick() {
        this.target.takeDamage(this.power * this.stacks);
    }
    isLifeTapped() {
        return true;
    }
}

class B1042 extends Buff {
    constructor(template, target, power) {
        super(template, target, power);
    }
    onTick() {
        this.target.heal(this.power);
    }
}

class B2010 extends Buff {
    constructor(template, target, power) {
        super(template, target, power);
    }
    maxHP() {
        return this.power * this.stacks;
    }
}

class B2011 extends Buff {
    constructor(template, target, power) {
        super(template, target, power);
    }
    getPow() {
        return this.power * this.stacks;
    }
}

class B2012 extends Buff {
    constructor(template, target, power) {
        super(template, target, power);
    }
    getVulnerability() {
        return 1;
    }
}

class B2040 extends Buff {
    constructor(template, target, power) {
        super(template, target, power);
    }
    mark() {
        return true;
    }
}

class BM102 extends Buff {
    constructor(template, target, power) {
        super(template, target, power);
    }
    isWilt() {
        return true;
    }
}

class BM200 extends Buff {
    constructor(template, target, power) {
        super(template, target, power);
    }
    getProtection() {
        return 1;
    }
}

class BM205 extends Buff {
    constructor(template, target, power) {
        super(template, target, power);
    }
    getProtection() {
        return 1;
    }
}

class BM208 extends Buff {
    constructor(template, target, power) {
        super(template, target, power);
    }
    getProtection() {
        return 1;
    }
}

class BM304 extends Buff {
    constructor(template, target, power) {
        super(template, target, power);
    }
    getPow() {
        return this.power * this.stacks;
    }
}

class BM305 extends Buff {
    constructor(template, target, power) {
        super(template, target, power);
    }
    getProtection() {
        return 0.25;
    }
}

class BM902 extends Buff {
    constructor(template, target, power) {
        super(template, target, power);
    }
    thorns() {
        return this.power;
    }
}

class BM904A extends Buff {
    constructor(template, target, power) {
        super(template, target, power);
    }
    getProtection() {
        return 1;
    }
    debuffImmune() {
        return true;
    }
}

class BM905A extends Buff {
    constructor(template, target, power) {
        super(template, target, power);
    }
    getVulnerability(attacker) {
        if(attacker.type === "Might") return 1;
        return 0;
    }
}

class BM905B extends Buff {
    constructor(template, target, power) {
        super(template, target, power);
    }
    getVulnerability(attacker) {
        if(attacker.type === "Mind") return 1;
        return 0;
    }
}

class BM905C extends Buff {
    constructor(template, target, power) {
        super(template, target, power);
    }
    getVulnerability(attacker) {
        if(attacker.type === "Moxie") return 1;
        return 0;
    }
}

class BM905D extends Buff {
    constructor(template, target, power) {
        super(template, target, power);
    }
    getProtection() {
        return this.stacks * 0.1;
    }
}

class BM905E extends Buff {
    constructor(template, target, power) {
        super(template, target, power);
    }
}

class BM905F extends Buff {
    constructor(template, target, power) {
        super(template, target, power);
    }
    getVulnerability() {
        return this.stacks * 0.2;
    }
}

class BM906 extends Buff {
    constructor(template, target, power) {
        super(template, target, power);
    }
    onHitting() {
        this.target.takeDamage(this.power * this.stacks);
    }
}

class BM906A extends Buff {
    constructor(template, target, power) {
        super(template, target, power);
    }
    getProtection() {
        return 0.75;
    }
}

class BM906B extends Buff {
    constructor(template, target, power) {
        super(template, target, power);
    }
    maxHP() {
        return -Math.floor(this.target.hpmax / 10) * this.stacks;
    }
}

class BM907 extends Buff {
    constructor(template, target, power) {
        super(template, target, power);
    }
}

class BM907A extends Buff {
    constructor(template, target, power) {
        super(template, target, power);
    }
    getProtection() {
        return 1;
    }
    onHit() {
        this.target.takeDamage(1, true);
    }
}

class BM907B extends Buff {
    constructor(template, target, power) {
        super(template, target, power);
    }
}

class BM907C extends Buff {
    constructor(template, target, power) {
        super(template, target, power);
    }
    getProtection() {
        return 1;
    }
    expire() {
        this.target.passiveCheck("treeBuffGone");
    }
}

class BM908A extends Buff {
    constructor(template, target, power) {
        super(template, target, power);
    }
    confusion() {
        return true;
    }
}

class BM908B extends Buff {
    constructor(template, target, power) {
        super(template, target, power);
    }
    getProtection() {
        return 1;
    }
    onHit(attack) {
        this.target.heal(Math.floor(attack.power * this.power));
    }
}

class BM909 extends Buff {
    constructor(template, target, power) {
        super(template, target, power)
    }
}

class BM909A1 extends Buff {
    constructor(template, target, power) {
        super(template, target, power)
    }
    parry() {
        if(this.stacks === 1) return this.power;
        return 0;
    }
    getProtection() {
        if(this.stacks === 1) return 1;
        return 0;
    }
    onHit() {
        if(this.stacks === 1) {
            buffList.generateBuff('BM909A1', this.target, 1);
        }
    }
}

class BM909B1 extends Buff {
    constructor(template, target, power, power2) {
        super(template, target, power, power2)
    }
    onTick() {
        this.target.healPercent(this.power2);
    }
}

class BM909C1 extends Buff {
    constructor(template, target, power) {
        super(template, target, power)
    }
}

class BM909A2 extends Buff {
    constructor(template, target, power) {
        super(template, target, power)
    }
    mark(type) {
        return type === "Might";
    }
    phase(type) {
        return type !== "Might";
    }
}

class BM909B2 extends Buff {
    constructor(template, target, power) {
        super(template, target, power)
    }
    mark(type) {
        return type === "Mind";
    }
    phase(type) {
        return type !== "Mind";
    }
}

class BM909C2 extends Buff {
    constructor(template, target, power) {
        super(template, target, power)
    }
    mark(type) {
        return type === "Moxie";
    }
    phase(type) {
        return type !== "Moxie";
    }
}

class BM909C3 extends Buff {
    constructor(template, target, power) {
        super(template, target, power)
    }
    getVulnerability() {
        return 1;
    }
}

var BuffLookup = {
    B0010: B0010,
    B0011: B0011,
    B0012: B0012,
    B0020: B0020,
    B0021: B0021,
    B0022: B0022,
    B0041: B0041,
    B0042: B0042,
    B1010: B1010,
    B1012: B1012,
    B1020: B1020,
    B1022: B1022,
    B1030: B1030,
    B1042: B1042,
    B2010: B2010,
    B2011: B2011,
    B2012: B2012,
    B2040: B2040,
    BM102: BM102,
    BM200: BM200,
    BM205: BM205,
    BM208: BM208,
    BM304: BM304,
    BM305: BM305,
    BM902: BM902,
    BM904A: BM904A,
    BM905A: BM905A,
    BM905B: BM905B,
    BM905C: BM905C,
    BM905D: BM905D,
    BM905E: BM905E,
    BM905F: BM905F,
    BM906: BM906,
    BM906A: BM906A,
    BM906B: BM906B,
    BM907: BM907,
    BM907A: BM907A,
    BM907B: BM907B,
    BM907C: BM907C,
    BM908A: BM908A,
    BM908B: BM908B,
    BM909: BM909,
    BM909A1: BM909A1,
    BM909B1: BM909B1,
    BM909C1: BM909C1,
    BM909A2: BM909A2,
    BM909B2: BM909B2,
    BM909C2: BM909C2,
    BM909C3: BM909C3,
  };

class BuffManager {
    constructor(list) {
        this.templates = [];
        this.uniqueid = 0;
        for(let item of list) {
            this.templates.push(item);
        }
    }
    byId(id) {
        return this.templates.find(b => b.id === id);
    }
    generateBuff(id, target) {
        var power = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 0;
        var power2 = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : 0;
        if(target === undefined) return;
        if(target.debuffImmune()) return;
        if(target.hasBuff(id)) {
            target.getBuff(id).addCast();
            return;
        }
        let template = this.byId(id);
        let buff = new BuffLookup[id](template, target, power, power2);
        buff.uniqueid = `BI${this.uniqueid++}`;
        target.addBuff(buff);
    }
    removeBuff(id, target) {
        if(!target.hasBuff(id)) return;
        target.removeBuff(id);
    }
    clearBuffs(target) {
        for(let buff of target.buffs) {
            this.removeBuff(buff.id, target);
        }
    }
    clearDebuffs(target) {
        for(let buff of target.buffs) {
            if(buff.type !== 'debuff') return;
            this.removeBuff(buff.id, target);
        }
    }
    maxStack(id) {
        return this.byId(id).maxStack;
    }
}

class Combatant {
    constructor(props) {
        Object.assign(this, props);
        this.hp = 1;
        this.critDmg = 1.5;
        this.buffs = [];
        this.state = null;
    }
    buffTick(type, attack) {
        for(let buff of this.buffs) {
            buff.buffTick(type, attack)
        }
        this.buffs = this.buffs.filter(b => !b.expired());
    }
    passiveCheck(type, attack) {
        if(this.passiveSkill === null) return;
        skillList.byId(this.passiveSkill).passiveCheck(type, this, attack);
    }
    takeAttack(attack) {
        let reducedDamage = Math.floor(attack.power * this.getProtection() * this.getVulnerability(attack.attacker));
        this.hp = Math.max(this.hp - reducedDamage, 0);
        if(this.hp === 0) {
            buffList.clearBuffs(this);
            this.passiveCheck("dead", attack);
        }
        if(this.thorns() > 0) attack.attacker.takeDamage(this.thorns());
        if(this.parry() > 0) attack.attacker.takeDamage(this.parry());
        if(this.beornTank() > 0) {
            heroesList.byId('H001').takeDamage(this.beornTank());
        }
        this.buffTick('onHit', attack);
        this.passiveCheck('onHit', attack);
    }
    takeDamage(damage, ignoreProtection) {
        var mod = ignoreProtection ? 1 : this.getProtection();
        var reducedDamage = Math.floor(damage * mod);
        this.hp = Math.max(this.hp - reducedDamage, 0);
        if(this.hp === 0) {
            buffList.clearBuffs(this);
            this.passiveCheck('dead');
        }
    }
    takeDamagePercent(hpPercent) {
        this.hp -= Math.floor((this.maxHP() * hpPercent) / 100);
        this.hp = Math.max(0, this.hp);
        if(this.hp === 0) {
            buffList.clearBuffs(this);
            this.passiveCheck('dead');
        }
    }
    hasBuff(id) {
        return this.buffs.some(b => b.id === id);
    }
    getBuff(id) {
        return this.buffs.find(b => b.id === id);
    }
    getBuffStacks(id) {
        if(!this.hasBuff(id)) return 0;
        return this.getBuff(id).stacks;
    }
    addBuff(buff) {
        this.buffs.push(buff);
        this.hp = Math.min(this.hp, this.maxHP());
    }
    removeBuff(id) {
        this.buffs = this.buffs.filter(b => b.id !== id);
        this.hp = Math.min(this.hp, this.maxHP());
    }
    getPow() {
        var pow = Math.floor(this.pow + this.getBuffPower());
        return Math.floor(pow * (1 + this.getBuffPowerPercent()));
    }
    getProtection() {
        return 1 - (this.protection + this.getBuffProtection());
    }
    getVulnerability(attacker) {
        return 1 + this.getBuffVulnerability(attacker);
    }
    getAdjPow() {
        return this.getPow();
    }
    dead() {
        return this.hp <= 0;
    }
    alive() {
        return this.hp > 0;
    }
    maxHP() {
        var hp = Math.floor(this.hpmax + this.getBuffMaxHP());
        return Math.floor(hp * (1 + this.getBuffMaxHPPercent()));
    }
    missingHP() {
        return this.maxHP() - this.hp;
    }
    hpLessThan(percent) {
        return this.maxHP() * percent >= this.hp;
    }
    hpGreaterThan(percent) {
        return this.maxHP() * percent <= this.hp;
    }
    heal(hp) {
        if(this.hp === 0) return;
        if(this.isWilt()) hp = Math.floor(hp / 2);
        this.hp = Math.min(this.hp + hp, this.maxHP());
    }
    healPercent(percent) {
        if(this.hp === 0) return;
        if(this.isWilt()) hp = Math.floor(hp / 2);
        this.hp += Math.floor((this.maxHP() * percent) / 100);
        this.hp = Math.min(this.hp, this.maxHP());
    }
    setHP(hp) {
        if(this.hp === 0) return;
        this.hp = Math.min(hp, this.maxHP());
    }
    resetPlaybookPosition() {
        this.playbook.reset();
    }
    getSkill() {
        return this.playbook.nextSkill();
    }
    getActiveSkill() {
        return this.playbook.skillCount();
    }
    getSkillIds() {
        return this.playbook.getSkillIds();
    }
    mark(type) {
        return this.buffs.some(b => b.mark(type));
    }
    phase(type) {
        return this.buffs.some(b => b.phase(type));
    }
    parry() {
        return this.buffs.reduce((acc, b) => acc + b.parry(), 0);
    }
    confusion(isNormal) {
        if(isNormal) return false;
        return this.buffs.some(b => b.confusion());
    }
    getBuffProtection() {
        return this.buffs.reduce((acc, b) => acc + b.getProtection(), 0);
    }
    getBuffVulnerability(attacker) {
        return this.buffs.reduce((acc, b) => acc + b.getVulnerability(attacker), 0);
    }
    getBuffPower() {
        return this.buffs.reduce((acc, b) => acc + b.getPow(), 0);
    }
    getBuffPowerPercent(){
        return this.buffs.reduce((acc, b) => acc + b.getPowPercent(), 0);
    }
    getBuffMaxHP() {
        return this.buffs.reduce((acc, b) => acc + b.maxHP(), 0);
    }
    getBuffMaxHPPercent() {
        return this.buffs.reduce((acc, b) => acc + b.maxHPPercent(), 0);
    }
    debuffImmune() {
        return this.buffs.some(b => b.debuffImmune());
    }
    buffCount() {
        return this.buffs.filter(b => b.type === 'buff').length;
    }
    debuffCount() {
        return this.buffs.filter(b => b.type === 'debuff').length;
    }
    removeBuffs() {
        this.buffs = [];
        this.hp = Math.min(this.hp, this.maxHP());
    }
    removeDebuffs() {
        this.buffs = this.buffs.filter(b => b.type !== 'debuff');
        this.hp = Math.min(this.hp, this.maxHP());
    }
    isChilled() {
        return this.buffs.some(b => b.isChilled());   
    }
    isLifeTapped() {
        return this.buffs.some(b => b.isLifeTapped());   
    }
    isWilt() {
        return this.buffs.some(b => b.isWilt());   
    }
    underHalfHP() {
        return 2 * this.hp <= this.maxHP();
    }
    thorns() {
        return this.buffs.reduce((acc, b) => acc + b.thorns(), 0);
    }
    beornTank() {
        return this.buffs.reduce((acc, b) => acc + b.beornTank(), 0);
    }
}

const HeroState = {
    idle: 'Idle',
    inDungeon: 'In Dungeon',
    inQuest: 'In Quest'
}

class GearSlot {
    constructor(type) {
        this.gear = null;
        this.type = type;
        this.lvl = 0;
    }
    setGear(gear) {
        this.gear = gear;
    }
    removeGear() {
        this.gear = null;
    }
    pow() {
        if(this.gear === null) return 0;
        return Math.floor(this.gear.pow() * (1 + this.lvl * 0.1));
    }
    hp() {
        if(this.gear === null) return 0;
        return Math.floor(this.gear.hp() * (1 + this.lvl * 0.1));
    }
    empty() {
        return this.gear === null;
    }
    addLevel() {
        this.lvl++;
    }
    
}

class Hero extends Combatant {
    constructor(props) {
        super(props);
        this.uniqueid = this.id;
        this.hp = this.initialHP;
        this.pow = this.iniitialPow;
        this.critdmg = 1.5;
        this.unitType = 'hero';
        this.gearSlots = this.populateGearSlots();
        this.owned = false;
        this.state = HeroState.idle;
        this.protection = 0;
        this.playbook = playbookList.generate(this.startingPlaybook);
        this.passiveSkill = null;
    }
    populateGearSlots() {
        return Array.from(new Array(7).keys()).map((i) => new GearSlot(this[`slot${i+1}Type`]));
    }
    getPow(isNotBuffed) {
        if(isNotBuffed) return (this.iniitialPow + this.getGearPower());
        let pow = Math.floor(this.initialPow + this.getGearPower() + this.getBuffPower());
        return Math.floor(pow * (1 + this.getBuffPowerPercent()));
    }
    maxHP(isNotBuffed) {
        if(isNotBuffed) return (this.initialHP + this.getGearHP());
        let hp = Math.floor(this.initialHP + this.getGearHP() + this.getBuffMaxHP());
        return Math.floor(hp * (1 + this.getBuffMaxHPPercent()));
    }
    getGearPower() {
        return this.gearSlots.reduce((acc, slot) => (acc + slot.pow()), 0);
    }
    getGearHP() {
        return this.gearSlots.reduce((acc, slot) => (acc + slot.hp()), 0);
    }
    getAdjPow() {
        return Math.floor(this.getPow());
    }
    getEquipSlots(isNotBlank) {
        if(isNotBlank) return this.gearSlots.filter(g => !g.empty()).map(g => g.gear);
        return this.gearSlots.map(g => g.gear);
    }
    equip(container) {
        let slot = this.getSlot(container);
        if(slot !== undefined) slot.setGear(container);
    }
    remove(type) {
        let slot = this.getSlot(type);
        if(slot !== undefined) slot.removeGear();
    }
    slotEmpty(type) {
        let slot = this.getSlot(type);
        if(slot === undefined) return true;
        return slot.empty();
    }
    getSlot(type) {
        return this.gearSlots.find(g => g.type === type);
    }
    unequip(type) {
        this.remove(type);
    }
    hasEquip(type) {
        let slot = this.getSlot(type);
        if(slot === undefined) return false;
        return !slot.empty();
    }
    canEquipType(type) {
        return this.getSlot(type) !== undefined;
    }
    trinket() {
        return this.gearSlots('Trinkets');
    }
    upgradeSlot(type) {
        let slot = this.getSlot(type);
        if(slot !== undefined) slot.addLevel();
    }
    changePlaybook(id) {
        this.playbook = playbookList.generate(id);
    }
    swapPlaybook(id) {
        this.playbook = playbookList.generate(id);
    }
    canLearnPlaybook(id) {
        return this.playbooks.includes(id);
    }
}

class HeroManager {
    constructor(list) {
        this.heroes = [];
        for(let item of list) {
            this.heroes.push(new Hero(item));
        }
    }
    byId(id) {
        return this.heroes.find(h => h.id === id);
    }
    heroOwned(id) {
        return this.byId(id).owned;
    }
    equipItem(itemId, heroId) {
        this.byId(heroId).equip(recipeList.byId(itemId));
    }
    ownedHeroes() {
        return this.heroes.filter(h => h.owned);
    }
    gainHero(id) {
        this.byId(id).owned = true;
    }
    heroesThatCanEquip(item) {
        this.heroes.filter(h => h.canEquipType(item.type));
    }
    slotsByItem(item) {
        let type = item.type;
        return this.heroes
            .filter(h => h.owned && h.canEquipType(type))
            .reduce((acc, h) => [...acc, {id: h.id, canEquip: [h.getSlot(type)]}], [])
    }
    getContainerId(containerId) {
        return this.heroes.map(h => h.getEquipSlots(true)).flat().find(i => i.containerID = containerId);
    }
    hasContainer(containerId) {
        return this.heroes.map(h => h.getEquipSlots(true)).flat().findIndex(i => i.containerID = containerId) > -1;
    }
    upgradeSlot(id, type) {
        this.byId(id).upgradeSlot(type);
    }
    totalUpgrades() {
        return this.heroes.reduce((acc, h) => (acc + h.totalUpgrades()), 0);
    }
    swapPlaybook(id, pId) {
        this.byId(id).swapPlaybook(pId);
    }
    preloadGear(lvl, sharp) {
        for(const hero of this.heroes) {
            for(const slot of hero.gearSlots) {
                slot.gear = new ItemContainer(recipeList.byLevelType(lvl, slot.type).id, 3);
                if(slot.type !== 'Trinkets') slot.gear.sharp = sharp;
            }
        }
    }
}

class Mob extends Combatant {
    constructor(template, atk, hp, difficulty) {
        super(template);
        if(this.event === 'boss') {
            this.pow = Math.floor(this.powMod * Math.pow(1.3, difficulty));
            this.hpmax = Math.floor(this.hpMod * Math.pow(1.3, difficulty));
            this.hp = this.hpmax;
        } else {
            this.pow = Math.floor(atk * this.powMod);
            this.hpmax = Math.floor(hp * this.hpMod);
            this.hp = this.hpmax;
        }
        this.uniqueid = mobList.getUniqueId();
        this.playbook = playbookList.generate([this.skill1, this.skill2, this.skill3, this.skill4]);
        this.passive = skillList.byId(this.passiveSkill);
    }
}

class MobManager {
    constructor(list) {
        this.templates = [];
        for(let item of list) {
            this.templates.push(item);
        }
        this.idCount = 0;
    }
    byId(id) {
        return this.templates.find(t => t.id === id);
    }
    getUniqueId() {
        return this.idCount++;
    }
    generate(id, dungeon) {
        let atk = dungeon.pow + dungeon.floor * dungeon.powGain;
        let hp = dungeon.hp + dungeon.floor * dungeon.hpGain;
        return new Mob(this.byId(id), atk, hp, dungeon.difficulty());
    }
}

class TurnOrder {
    constructor(heroes, mobs) {
        this.heroes = heroes;
        this.mobs = mobs;
        this.order = interleave(heroes, mobs);
        this.position = 0;
        this.nextNotDead();
    }
    nextNotDead() {
        while(this.order[this.position].dead()) {
            this.position++;
        }
    }
    getOrder() {
        return this.order;
    }
    nextTurn() {
        return this.order[this.position];
    }
    nextPosition() {
        this.position++;
        if(this.position === this.order.length) this.position = 0;
        if(this.order[this.position].dead()) this.nextPosition();
    }
    getCurrentId() {
        return this.currentTurn().uniqueid;
    }
    currentTurn() {
        return this.order[this.position];
    }
    adjustOrder(heroes, mobs) {
        let uniqueid = this.getCurrentId();
        this.heroes = heroes;
        this.mobs = mobs;
        this.order = interleave(heroes, mobs);
        this.position = this.order.findIndex(m => m.uniqueid === uniqueid);
    }
    positionInParty() {
        let uniqueid = this.getCurrentId();
        let index = this.heroes.findIndex(h => h.uniqueid === uniqueid);
        if( index > -1) {
            return index;
        }
        index = this.mobs.findIndex(m => m.uniqueid === uniqueid);
        return index;
    }
}

const SideType = {
    allies: 'Allies',
    enemies: 'Enemies'
};

const TargetType = {
    first: 'First',
    second: 'Second',
    third: 'Third',
    fourth: 'Fourth',
    self: 'Self',
    all: 'All',
    missingHP: 'Missing HP',
    lowestHP: 'Lowest HP',
    behind: 'Behind',
    cleave: 'Cleave',
    before: 'Before',
    after: 'After',
    adjacent: 'Adjacent',
    mirror: 'Mirror',
    random: 'Random',
    enemies: 'Enemies',
    twoLeastMax: 'Two Least Max',
    swipe: 'Swipe',
    firstMoxie: 'First Moxie'
}

class Round {
    constructor(attacker, allies, enemies, attack, dungeon) {
        this.attacker = attacker;
        this.allies = allies;
        this.enemies = enemies;
        this.attack = attack;
        this.power = Math.floor(this.attacker.getPow() * this.attack.powMod);
        this.dungeon = dungeon;
    }
    getTarget(target, side) {
        let isNormal = (arguments.length > 2 && arguments[2] !== undefined) ? arguments[2] : false;
        let aliveEnemies = this.enemies.filter(e => e.alive() && !e.phase(this.attacker.type));
        let enemies = aliveEnemies.some(e => e.mark(this.attacker.type)) ? aliveEnemies.filter(e => e.mark(this.attacker.type)) : aliveEnemies;
        let aliveAllies = this.allies.filter(h => h.alive());
        let living = aliveAllies;
        let myself = [this.attacker];
        if(this.attacker.confusion(isNormal) && side === SideType.allies) {
            living = enemies;
            myself = [enemies[0]];
        }
        if(!this.attacker.confusion(isNormal) && side === SideType.enemies) {
            living = enemies;
        }
        if(target === TargetType.first) return [living[0]];
        if(target === TargetType.second) {
            if(living.length === 1) return [living[0]];
            return [living[1]];
        }
        if(target === TargetType.third) {
            if(living.length === 1) return [living[0]];
            if(living.length === 2) return [living[1]];
            return [living[2]];
        }
        if(target === TargetType.fourth) return [living[living.length - 1]];
        if(target === TargetType.self) return myself;
        if(target === TargetType.all) return living;
        if(target === TargetType.missingHP) {
            return [living.reduce((a, b) => a.missingHP() >= b.missingHP() ? a : b)]
        }
        if(target === TargetType.lowestHP) {
            return [living.reduce((a, b) => a.hp < b.hp ? a : b)]
        }
        if(target === TargetType.before) {
            let uid = this.attacker.uniqueid;
            let index = living.findIndex(l => l.uniqueid === uid);
            if(index === 0) return null;
            return [living[index - 1]];
        }
        if(target === TargetType.after) {
            let uid = this.attacker.uniqueid;
            let index = living.findIndex(l => l.uniqueid === uid);
            if(index === living.length-1) return null;
            return [living[index + 1]];
        }
        if(target === TargetType.behind) {
            let uid = this.attacker.uniqueid;
            let index = living.findIndex(l => l.uniqueid === uid);
            if(index === living.length-1) return null;
            return living.slice(index + 1);
        }
        if(target === TargetType.cleave) {
            if(living.length === 1) return [living[0]];
            return living.slice(0,2);
        }
        if(target === TargetType.swipe) {
            if(living.length === 1) return [living[0]];
            if(living.length === 2) return living.slice(0,2);
            return living.slice(0,3);
        }
        if(target === TargetType.adjacent) {
            let uid = this.attacker.uniqueid;
            let index = living.findIndex(l => l.uniqueid === uid);
            let targets = [];
            if(index !== living.length - 1) targets.push(living[index + 1]);
            if(index !== 0) targets.push(living[index - 1]);
            return targets;
        }
        if(target === TargetType.mirror) {
            let uid = this.attacker.uniqueid;
            let index = this.allies.findIndex(l => l.uniqueid === uid);
            if(this.enemies.some(e => e.mark(this.attacker.type))) {
                return [
                    this.enemies.find(e => e.mark(this.attackertype))
                ];
            }
            if(this.attacker.confusion()) return [this.attacker];
            if(this.enemies.length <= index) index = enemies.length - 1;
            if(this.enemies[index].alive()) return [this.enemies[index]];
            if(index > 0 && this.enemies[index - 1].alive()) return [this.enemies[index - 1]];
            if(index < this.enemies.length - 1 && this.enemies[index + 1].alive()) {
                return [this.enemies[index + 1]];
            }
            if(index - 1 > 0 && this.enemies[index - 2].alive()) return [this.enemies[index - 2]];
            if(index < this.enemies.length - 2 && this.enemies[index + 2].alive()) {
                return [this.enemies[index + 2]];
            }
            if(index - 2 > 0 && this.enemies[index - 3].alive()) return [this.enemies[index - 3]];
            if(index < this.enemies.length - 3 && this.enemies[index + 3].alive()) {
                return [this.enemies[index + 3]];
            }
            return [this.enemies[index + 3]];
        }
        if(target === TargetType.random) {
            let seed = aliveEnemies.reduce((acc, e) => acc + e.hp,0) + aliveAllies.reduce((acc, a) => acc + a.hp,0);
            return [living[seed % living.length]];
        }
        if(target === TargetType.enemies) {
            return this.enemies;
        }
        if(target === TargetType.twoLeastMax) {
            return living.sort((a,b) => a.maxHP() - b.maxHP()).slice(0,2);
        }
        if(target === TargetType.firstMoxie) {
            let index = living.findIndex(l => l.type === 'Moxie');
            if(index > -1) {
                return [living[index]];
            }
            return undefined;
        }
    }
}

class CombatManager {
    constructor(){}
    executeTurn(dungeon) {
        let attacker = dungeon.order.currentTurn();
        let allies = attacker.unitType === 'hero' ? dungeon.party.heroes : dungeon.mobs;
        let enemies = attacker.unitType === 'hero' ? dungeon.mobs : dungeon.party.heroes;
        let attack = attacker.getSkill();
        let round = new Round(attacker, allies, enemies, attack, dungeon);
        this.execute(round);
    }
    execute(round) {
        skillList.skillEffects[round.attack.id](round);
        round.attacker.buffTick('onHitting');
        if(round.attack.id !== 'S0000') {
            round.attacker.buffTick('onSpecial');
        }
    }
}

const DungeonStatus = {
    empty: 'Empty',
    adventuring: 'Adventuring',
    success: 'Success',
    failure: 'Failure'
}

class Dungeon {
    constructor(props) {
        Object.assign(this, props);
        this.party = null;
        this.mobs = [];
        this.setMobIds();
        this.maxFloor = 0;
        this.floor = 1;
        this.floorClear = 0;
        this.order = null;
        this.status = DungeonStatus.empty;
        this.lastParty = null;
        this.dungeonTime = 0;
        this.rewardTime = 0;
        this.rewardTimeRate = 0;
        this.rewardTimeRateRound = 0;
    }
    addTime() {
        if(this.status !== DungeonStatus.adventuring) return;
        this.dungeonTime += dungeonList.speed;
        let attacker = this.order.nextTurn();
        attacker.buffTick('onMyTurn');
        this.buffTick('onTurn');
        this.passiveCheck('onTurn');
        if(this.mobs.every(m => m.dead())) {
            this.nextFloor();
            return;
        } else if (this.party.isDead()) {
            this.previousFloor();
            return;
        }
        if(attacker.alive()) combatManager.executeTurn(this);
        if(this.mobs.every(m => m.dead())) {
            this.nextFloor();
            return;
        } else if (this.party.isDead()) {
            this.previousFloor();
            return;
        } else {
            this.order.nextPosition();
        }
    }
    setMobIds() {
        this.mobIds = [];
        this.mobIds.push(this.mob1);
        if(this.mob2 !== null) this.mobIds.push(this.mob2);
        if(this.mob3 !== null) this.mobIds.push(this.mob3);
        if(this.mob4 !== null) this.mobIds.push(this.mob4);
    }
    setRewardRate(floor) {
        this.floorClear = Math.max(floor, this.floorClear);
        this.rewardAmt = Math.ceil(floor / 40);
        let rewardRate = Math.floor((floor - 1) / 10) * 0.25 + 1;
        this.rewardTimeRate = (this.rewardAmt * 1e4) / rewardRate;
        this.rewardTimeRateRound = (this.rewardTimeRate / 1e3).toFixed(1);
    }
    initializeParty(party) {
        this.party = party;
        this.lastParty = party.heroID;
    }
    resetDungeon(retainMaxFloor) {
        if(![DungeonStatus.adventuring,DungeonStatus.success,DungeonStatus.failure].includes(this.status)) return;
        this.party.reset();
        this.status = DungeonStatus.empty;
        this.party = null;
        this.order = null;
        this.mobs = [];
        this.setMobIds();
        if(!retainMaxFloor) {
            this.floor = 1;
        }
        this.initialFloor = this.maxFloor;
        this.floorClear = 0;
        this.dungeonTime = 0;
        this.rewardAmt = 0;
        this.rewardTimeRate = 0;
        this.rewardTime = 0;
    }
    previousFloor() {
        if(this.type === 'boss') return (this.status = DungeonStatus.failure);
        this.floor = Math.max(1, this.floor - 1);
        if(this.floor <= this.initialFloor) {
            this.status = DungeonStatus.failure;
        } else {
            this.status = DungeonStatus.success;
        }
        return;
    }
    nextFloor() {
        if(this.type === 'boss') {
            this.maxFloor++;
            this.status = DungeonStatus.success;
            return;
        }
        this.setRewardRate(this.floor);
        this.maxFloor = Math.max(this.maxFloor, this.floor);
        this.floor++;
        this.resetFloor();
    }
    resetFloor() {
        this.mobs = [];
        this.setMobIds();
        for(let mobId of this.mobIds) {
            let mob = mobList.generate(mobId, this);
            mob.dungeonId = this.id;
            mob.dungeon = this;
            this.mobs.push(mob);
        }
        this.party.reset();
        this.order = new TurnOrder(this.party.heroes, this.mobs);
        this.passiveCheck('initial');
    }
    difficulty() {
        if(this.type === 'regular') return 0;
        return this.maxFloor;
    }
    buffTick(type) {
        for(let hero of this.party.heroes) {
            hero.buffTick(type, null);
        }
        for(let mob of this.mobs) {
            mob.buffTick(type, null);
        }
    }
    passiveCheck(type) {
        for(let hero of this.party.heroes) {
            hero.passiveCheck(type, null);
        }
        for(let mob of this.mobs) {
            mob.passiveCheck(type, null);
        }
    }
    beaten() {
        return this.maxFloor > 0;
    }
    addMob(id, first) {
        let mob = mobList.generate(id, this);
        if(first) {
            this.mobs.unshift(mob);
            this.mobIds.unshift(id);
        } else {
            this.mobs.push(mob);
            this.mobIds.push(id);
        }
        this.order.adjustOrder(this.party.heroes, this.mobs);
        mob.passiveCheck('initial', null);
    }
    removeMob(id) {
        this.mobs = this.mobs.filter(m => m.uniqueid !== id);
        this.mobIds = this.mobs.map(m => m.id);
        this.order.adjustOrder(this.party.heroes, this.mobs);
    }
    allBuffs() {
        if(!this.party) return [];
        return this.party.heroes.map(h => h.buffs).concat(this.mobs.map(m => m.buffs));
    }
}

class DungeonManager {
    constructor(list) {
        this.dungeons = [];
        this.speed = 1500;
        for(const item of list) {
            this.dungeons.push(new Dungeon(item));
        }
    }
    byId(id) {
        return this.dungeons.find(d => d.id === id);
    }
}

class Party {
    constructor(heroID) {
        this.heroID = heroID;
        this.heroes = heroID.map(id => {
            const [hId, pId, gId] = id.split('.');
            const hero = heroesList.byId(hId);
            if(pId !== undefined) {
                hero.playbook = playbookList.generate(pId);
            }
            if(gId !== undefined) {
                let slots = gId.split(',');
                for(let [index, slot] of hero.gearSlots.entries()) {
                    slot.gear.setSynth(slots[index]);
                }
            }
            return hero;
        });
    }
    hasMember(member) {
        return this.heroes.includes(member);
    }
    size() {
        return this.heroes.length;
    }
    alive() {
        return this.heroes.some(h => !h.dead());
    }
    isDead() {
        return this.heroes.every(h => h.dead());
    }
    reset() {
        for(const hero of this.heroes) {
            hero.hp = hero.maxHP();
            hero.resetPlaybookPosition();
            hero.removeBuffs();
        }
    }
}

const recipeList = new RecipeManager(recipeData);
const skillList = new SkillManager(skillData);
const playbookList = new PlaybookManager(playbookData);
const buffList = new BuffManager(buffData);
const heroesList = new HeroManager(heroData);
const mobList = new MobManager(mobData);
const dungeonList = new DungeonManager(dungeonData);
const combatManager = new CombatManager();

const {dungeonId, floor, maxFloor, level, sharpness, parties} = workerData;

heroesList.preloadGear(level, sharpness);
for(const hero of heroesList.heroes) {
    for(const slot of hero.gearSlots) {
        if(slot.type === 'Trinkets') continue;
        slot.addLevel();
        slot.addLevel();
        // if(hero.type === 'Might') {
        //     slot.addLevel();
        //     slot.addLevel();
        // } else if (hero.type === 'Mind' && (slot.type === 'Staves' || slot.type === 'Tomes')) {
        //     slot.addLevel();
        //     slot.addLevel();
        // } else if (hero.type === 'Moxie' && (slot.type === 'Knives' || slot.type === 'Thrown')) {
        //     slot.addLevel();
        //     slot.addLevel();
        // } else if (hero.id === 'H202' && slot.type !== 'Rings') {
        //     slot.addLevel();
        //     slot.addLevel();
        // } else if (hero.id === 'H202') {
        //     slot.addLevel();
        // }
    }
}

const dungeon = dungeonList.byId(dungeonId);
dungeon.maxFloor = floor;
dungeon.floor = dungeon.maxFloor;

let results = [];
for(let [index, p] of parties.entries()) {
    if(index % 1000 === 0) parentPort.postMessage({status: index});
    dungeon.resetDungeon(maxFloor);
    dungeon.initializeParty(new Party(p));
    dungeon.resetFloor();
    dungeon.status = DungeonStatus.adventuring;
    while(![DungeonStatus.success, DungeonStatus.failure].includes(dungeon.status)) {
        dungeon.addTime();
    }
    results.push({heroID: p, ...pick(dungeon, 'id', 'dungeonTime', 'status', 'floor', 'rewardAmt', 'rewardTimeRate','rewardTimeRateRound')});
}
parentPort.postMessage({results});