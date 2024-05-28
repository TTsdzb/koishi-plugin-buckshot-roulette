import { Context, Session, Schema, h, Random } from "koishi";
import dedent from "dedent";

import {} from "koishi-plugin-adapter-onebot";

export const name = "buckshot-roulette2";

export interface Config {
  quickUse: boolean;
  alwaysShowDesc: boolean;
}

export const Config: Schema<Config> = Schema.object({
  quickUse: Schema.boolean()
    .description("发送道具名可直接使用道具")
    .default(true),
  alwaysShowDesc: Schema.boolean()
    .description("对战信息中总是显示道具描述")
    .default(true),
});

async function checkRole(session: Session): Promise<boolean> {
  const botInfo = await session.onebot.getGroupMemberInfo(
    session.channelId,
    session.bot.selfId
  );
  if (botInfo["role"] === "member") return false;
  if (botInfo["role"] === "owner") return true;
  const userInfo = await session.onebot.getGroupMemberInfo(
    session.channelId,
    session.userId
  );
  return userInfo["role"] === "member";
}

export function apply(ctx: Context, config: Config) {
  let game = {};
  let bullets = [
    ["实弹", "空包弹", "空包弹"],
    ["实弹", "实弹", "空包弹", "空包弹"],
    ["实弹", "实弹", "空包弹", "空包弹", "空包弹"],
    ["实弹", "实弹", "实弹", "空包弹", "空包弹", "空包弹"],
    ["实弹", "实弹", "实弹", "空包弹", "空包弹", "空包弹", "空包弹"],
    ["实弹", "实弹", "实弹", "实弹", "空包弹", "空包弹", "空包弹", "空包弹"],
    ["实弹", "实弹", "实弹", "空包弹", "空包弹"],
    ["实弹", "实弹", "实弹", "实弹", "空包弹", "空包弹"],
  ];
  const itemList = {
    手锯: {
      description: "下一发造成双倍伤害，不可叠加",
      description2: "下一发造成双倍伤害，不可叠加",
      use(channelId: string, player: number) {
        game[channelId].double = true;
        return {
          success: true,
          result: ["你用手锯锯短了枪管，下一发将造成双倍伤害"],
        };
      },
    },
    放大镜: {
      description: "查看当前膛内的子弹",
      description2: "查看当前膛内的子弹",
      use(channelId: string, player: number) {
        return {
          success: true,
          result: [
            `你使用了放大镜，看到了膛内的子弹是${
              game[channelId].bullet.slice(-1)[0]
            }`,
          ],
        };
      },
    },
    啤酒: {
      description: "卸下当前膛内的子弹",
      description2: "卸下当前膛内的子弹",
      use(channelId: string, player: number) {
        let bullet = game[channelId].bullet.pop();
        if (game[channelId].bullet.length === 0) {
          let back = nextRound(game[channelId]);
          game[channelId] = back.cache;
          return {
            success: true,
            result: [
              `你喝下了啤酒，把当前膛内的子弹抛了出来，是一发${bullet}`,
              back.result,
            ],
          };
        }
        return {
          success: true,
          result: [`你喝下了啤酒，把当前膛内的子弹抛了出来，是一发${bullet}`],
        };
      },
    },
    香烟: {
      description: "恢复1点生命值",
      description2: "恢复1点生命值",
      use(channelId: string, player: number) {
        if (game[channelId][`player${player}`].hp < 6) {
          game[channelId][`player${player}`].hp++;
          return {
            success: true,
            result: ["你抽了一根香烟，恢复了1点生命值"],
          };
        } else {
          return {
            success: true,
            result: ["你抽了一根香烟，但什么都没有发生，因为你的生命值是满的"],
          };
        }
      },
    },
    手铐: {
      description: "跳过对方的下一回合",
      description2: "跳过对方的下一回合",
      use(channelId: string, player: number) {
        if (game[channelId].usedHandcuff) {
          return {
            success: false,
            result: ["一回合只能使用一次手铐"],
          };
        } else {
          game[channelId][`player${player === 1 ? 2 : 1}`].handcuff = true;
          game[channelId].usedHandcuff = true;
          return {
            success: true,
            result: ["你给对方上了手铐，对方的下一回合将被跳过"],
          };
        }
      },
    },
    肾上腺素: {
      description: "选择对方的1个道具并立刻使用，不能选择肾上腺素",
      description2: "选择对方的1个道具并立刻使用，不能选择肾上腺素",
      use(channelId: string, player: number, item: string) {
        let back = itemList[item].use(channelId, player);
        if (back.success) {
          game[channelId][`player${player == 1 ? 2 : 1}`].item.splice(
            game[channelId][`player${player == 1 ? 2 : 1}`].item.indexOf(item),
            1
          );
        }
        return back;
      },
    },
    过期药物: {
      description: "50%概率恢复2点生命值，50%概率损失1点生命值",
      description2: "50%概率恢复2点生命值，50%概率损失1点生命值",
      use(channelId: string, player: number) {
        if (Random.bool(0.5)) {
          let diff = 6 - game[channelId][`player${player}`].hp;
          game[channelId][`player${player}`].hp += diff < 2 ? diff : 2;
          return {
            success: true,
            result: ["你吃下了过期药物，感觉不错，恢复了2点生命值"],
          };
        } else {
          game[channelId][`player${player}`].hp--;
          if (game[channelId][`player${player}`].hp <= 0) {
            let id = game[channelId][`player${player === 1 ? 2 : 1}`].id;
            delete game[channelId];
            return {
              success: false,
              result: [
                dedent`你吃下了过期药物，感觉不太对劲，但还没来得及思考就失去了意识
                              ${h.at(id)}获得了胜利，并带着一箱子钱离开了
                              游戏结束`,
              ],
            };
          }
          return {
            success: true,
            result: ["你吃下了过期药物，感觉不太对劲，损失了1点生命值"],
          };
        }
      },
    },
    逆转器: {
      description: "转换膛内的子弹，实弹变为空包弹，反之亦然",
      description2: "转换膛内的子弹，实弹变为空包弹，空包弹变为实弹",
      use(channelId: string, player: number) {
        if (game[channelId].bullet.pop() === "实弹") {
          game[channelId].bullet.push("空包弹");
        } else {
          game[channelId].bullet.push("实弹");
        }
        return {
          success: true,
          result: ["你使用了逆转器，膛内的子弹发生了一些变化"],
        };
      },
    },
    骰子: {
      description: "掷一个六面骰子，根据点数触发不同的效果",
      description2: dedent`掷一个六面骰子，根据点数触发以下效果
                          1：膛内子弹变为实弹
                          2：膛内子弹变为空包弹
                          3：随机触发某个道具的效果
                          4：恢复1滴血
                          5：损失1滴血
                          6：直接结束你的回合`,
      use(channelId: string, player: number) {
        let dice = Random.int(1, 7);
        switch (dice) {
          case 1:
            game[channelId].bullet[game[channelId].bullet.length - 1] = "实弹";
            return {
              success: true,
              result: ["你骰出了1，膛内的子弹变成了实弹"],
            };
          case 2:
            game[channelId].bullet[game[channelId].bullet.length - 1] =
              "空包弹";
            return {
              success: true,
              result: ["你骰出了2，膛内的子弹变成了空包弹"],
            };
          case 3:
            let item = Random.pick(
              Object.keys(itemList).filter((item) => item !== "骰子")
            );
            let back = itemList[item].use(channelId, player);
            return {
              success: true,
              result: [`你骰出了3，转眼间骰子就变成了${item}`, ...back.result],
            };
          case 4:
            if (game[channelId][`player${player}`].hp < 6) {
              game[channelId][`player${player}`].hp++;
              return {
                success: true,
                result: [
                  "你骰出了4，这个数字让你感觉神清气爽，恢复了1点生命值",
                ],
              };
            } else {
              return {
                success: true,
                result: [
                  "你骰出了4，这个数字让你神清气爽，但什么都没有发生，因为你的生命值是满的",
                ],
              };
            }
          case 5:
            game[channelId][`player${player}`].hp--;
            if (game[channelId][`player${player}`].hp <= 0) {
              let id = game[channelId][`player${player === 1 ? 2 : 1}`].id;
              delete game[channelId];
              return {
                success: false,
                result: [
                  dedent`你骰出了5，你感觉这个数字不太行，但还没来得及思考就失去了意识
                                ${h.at(id)}获得了胜利，并带着一箱子钱离开了`,
                ],
              };
            } else {
              return {
                success: true,
                result: ["你骰出了5，你感觉这个数字不太行，损失了1点生命值"],
              };
            }
          case 6:
            game[channelId][`player${game[channelId].currentTurn}`].item.splice(
              game[channelId][
                `player${game[channelId].currentTurn}`
              ].item.indexOf("骰子"),
              1
            );
            game[channelId].currentTurn = player === 1 ? 2 : 1;
            game[channelId].usedHandcuff = false;
            game[channelId].double = false;
            return {
              success: false,
              result: [
                `你掷出了6，这个数字让你觉得被嘲讽了，急的你直接结束了回合<br/>接下来是${h.at(
                  game[channelId][`player${game[channelId].currentTurn}`].id
                )}的回合`,
              ],
            };
        }
      },
    },
  };

  ctx.command("恶魔轮盘", "WONDERFUL PLAY，SHALL WE？💀");

  ctx
    .command("恶魔轮盘.创建游戏")
    .option(
      "time",
      "-t <time:posint> 设定死亡惩罚，只在Onebot平台生效，默认关闭",
      {
        fallback: 0,
      }
    )
    .action(async ({ session, options }) => {
      if (session.platform !== "onebot") {
        await session.send("非Onebot平台，死亡惩罚已禁用");
        options.time = 0;
      }
      if (options.time && !(await checkRole(session)))
        return "══恶魔轮盘══\n你以为你的权力大于一切？你不能创建这个游戏！";
      if (game[session.channelId] === undefined) {
        game[session.channelId] = {
          player1: {
            name: session.username,
            id: session.userId,
            hp: 6,
            item: [],
            handcuff: false,
          },
          status: "waiting",
          time: options.time,
        };
        return dedent`══恶魔轮盘══
                      游戏创建成功
                      玩家1：${session.username}(${session.userId})
                      玩家2：等待中
                      死亡惩罚：${options.time ? `${options.time}秒` : "无"}
                      发送“恶魔轮盘.加入游戏”以加入游戏`;
      } else if (game[session.channelId].status === "waiting") {
        return "══恶魔轮盘══\n当前频道已有游戏正在等待玩家\n发送“恶魔轮盘.加入游戏”以加入游戏";
      } else {
        return "══恶魔轮盘══\n当前频道已有游戏正在进行中";
      }
    });

  ctx.command("恶魔轮盘.加入游戏").action(async ({ session }) => {
    if (game[session.channelId] === undefined) {
      return "══恶魔轮盘══\n当前频道没有可以加入的游戏\n发送“恶魔轮盘.创建游戏”以创建游戏";
    } else if (game[session.channelId].status !== "waiting") {
      return "══恶魔轮盘══\n当前频道已有游戏正在进行中";
    } else if (game[session.channelId].player1.id === session.userId) {
      return "══恶魔轮盘══\n你不能加入你自己创建的游戏";
    } else if (game[session.channelId].time && !(await checkRole(session))) {
      return "══恶魔轮盘══\n你以为你的权力大于一切？你不能加入这个游戏！";
    } else {
      game[session.channelId].player2 = {
        name: session.username,
        id: session.userId,
        hp: 6,
        item: [],
        handcuff: false,
      };
      game[session.channelId].status = "full";
      return dedent`══恶魔轮盘══
                      游戏开始
                      玩家1：${game[session.channelId].player1.name}(${
        game[session.channelId].player1.id
      })
                      玩家2：${session.username}(${session.userId})
                      死亡惩罚：${
                        game[session.channelId].time
                          ? `${game[session.channelId].time}秒`
                          : "无"
                      }
                      由玩家1${h.at(
                        game[session.channelId].player1.id
                      )}发送“恶魔轮盘.开始游戏”以开始游戏`;
    }
  });

  ctx.command("恶魔轮盘.开始游戏").action(({ session }) => {
    if (game[session.channelId] === undefined) {
      return "══恶魔轮盘══\n当前频道没有可以开始的游戏\n发送“恶魔轮盘.创建游戏”以创建游戏";
    } else if (game[session.channelId].player1.id !== session.userId) {
      return "══恶魔轮盘══\n只有玩家1可以开始游戏";
    } else if (game[session.channelId].status !== "full") {
      return "══恶魔轮盘══\n正在等待玩家2\n发送“恶魔轮盘.加入游戏”以加入游戏";
    } else {
      game[session.channelId].status = "started";
      game[session.channelId].bullet = Random.shuffle(Random.pick(bullets));
      game[session.channelId].currentTurn = Random.int(1, 3);
      game[session.channelId].double = false;
      game[session.channelId].round = 0;
      game[session.channelId].usedHandcuff = false;
      let itemCount = Random.int(3, 6);
      for (let i = 0; i < itemCount - 1; i++) {
        game[session.channelId][
          `player${game[session.channelId].currentTurn}`
        ].item.push(Random.pick(Object.keys(itemList)));
      }
      for (let i = 0; i < itemCount; i++) {
        game[session.channelId][
          `player${game[session.channelId].currentTurn === 1 ? 2 : 1}`
        ].item.push(Random.pick(Object.keys(itemList)));
      }
      return dedent`══恶魔轮盘══
                      游戏开始
                      玩家1：${h.at(game[session.channelId].player1.id)}<br/>
                      玩家2：${h.at(game[session.channelId].player2.id)}<br/>
                      ${h.at(
                        game[session.channelId][
                          "player" + game[session.channelId].currentTurn
                        ].id
                      )}先手
                      先手方获得${
                        itemCount - 1
                      }个道具，后手方获得${itemCount}个道具
                      枪内目前有${count(
                        game[session.channelId].bullet,
                        "实弹"
                      )}发实弹和${count(
        game[session.channelId].bullet,
        "空包弹"
      )}发空包弹
                      发送“恶魔轮盘.对战信息”以查看当前对战的游戏信息（如血量，道具等）`;
    }
  });

  ctx.command("恶魔轮盘.对战信息").action(({ session }) => {
    if (game[session.channelId]?.status === "started") {
      let result = dedent`══恶魔轮盘══
                            --血量--
                            玩家1(${game[session.channelId].player1.name})：${
        game[session.channelId].player1.hp
      }点
                            玩家2(${game[session.channelId].player2.name})：${
        game[session.channelId].player2.hp
      }点

                            --玩家1的道具--\n`;
      for (let item of game[session.channelId].player1.item) {
        result +=
          `${item}` +
          (config.alwaysShowDesc ? `(${itemList[item].description})\n` : "\n");
      }
      result += `\n--玩家2的道具--\n`;
      for (let item of game[session.channelId].player2.item) {
        result +=
          `${item}` +
          (config.alwaysShowDesc ? `(${itemList[item].description})\n` : "\n");
      }
      result += `${
        config.alwaysShowDesc
          ? ""
          : "\n输入“恶魔轮盘.道具说明 [道具名]”以查看道具描述"
      }\n输入“恶魔轮盘.使用道具 [道具名]”${
        config.quickUse ? "或直接发送道具名" : ""
      }以使用道具\n输入“自己”或“对方”以选择向谁开枪`;
      return result;
    } else {
      return "══恶魔轮盘══\n当前频道没有正在进行的游戏\n发送“恶魔轮盘.创建游戏”以创建游戏";
    }
  });

  ctx
    .command("恶魔轮盘.使用道具 <item:string>", { checkArgCount: true })
    .action(async ({ session }, item) => {
      if (game[session.channelId]?.status !== "started") {
        return "══恶魔轮盘══\n当前频道没有正在进行的游戏\n发送“恶魔轮盘.创建游戏”以创建游戏";
      } else if (
        game[session.channelId][`player${game[session.channelId].currentTurn}`]
          .id !== session.userId
      ) {
        return "══恶魔轮盘══\n现在不是你的回合";
      } else {
        let cache = game[session.channelId];
        if (cache[`player${cache.currentTurn}`].item.includes(item)) {
          let pick;
          if (item === "肾上腺素") {
            await session.send(
              "你给自己来了一针肾上腺素，请在30秒内发送你想选择的道具名"
            );
            pick = await session.prompt(30000);
            if (pick == null) {
              return "选择超时，已取消使用";
            } else if (
              !cache[`player${cache.currentTurn === 1 ? 2 : 1}`].item.includes(
                pick
              )
            ) {
              return "对方没有这个道具，已取消使用";
            } else if (pick === "肾上腺素") {
              return "不能选择肾上腺素";
            }
          }
          game[session.channelId] = cache;
          let back = itemList[item].use(
            session.channelId,
            game[session.channelId].currentTurn,
            pick
          );
          if (back.success) {
            game[session.channelId][
              `player${game[session.channelId].currentTurn}`
            ].item.splice(
              game[session.channelId][
                `player${game[session.channelId].currentTurn}`
              ].item.indexOf(item),
              1
            );
          }

          back.result.forEach(async (item) => {
            await session.send(item);
          });
        }
      }
    });

  ctx
    .command("恶魔轮盘.道具说明 <item:string>", { checkArgCount: true })
    .action(async ({ session }, item) => {
      if (itemList[item] === undefined) {
        return "道具不存在";
      } else {
        return itemList[item].description2;
      }
    });

  ctx.command("恶魔轮盘.结束游戏").action(({ session }) => {
    if (game[session.channelId] === undefined) {
      return "══恶魔轮盘══\n当前频道没有已创建或正在进行的游戏";
    } else if (
      game[session.channelId].player1.id !== session.userId &&
      game[session.channelId].player2.id !== session.userId
    ) {
      return "══恶魔轮盘══\n只有当前游戏中的玩家才能结束游戏";
    } else {
      delete game[session.channelId];
      return `══恶魔轮盘══\n游戏已被${h.at(session.userId)}结束`;
    }
  });

  ctx.middleware(async (session, next) => {
    if (game[session.channelId]?.status !== "started") {
      return next();
    } else if (session.content === "自己" || session.content === "对方") {
      let cache = game[session.channelId];
      let player = `player${cache.currentTurn}`;
      if (cache[player].id !== session.userId) {
        return "现在不是你的回合";
      } else {
        let bullet = cache.bullet.pop();
        let result = dedent`══恶魔轮盘══
                            你将枪口对准了${session.content}，扣下了扳机
                            是${bullet}\n`;
        if (bullet === "实弹") {
          if (session.content === "自己") {
            const damage = cache.double ? 2 : 1;
            cache[player].hp -= damage;
            result += `你损失了${damage}点生命值`;
            if (cache[player].hp <= 0) {
              await session.send(result);
              delete game[session.channelId];
              if (cache.time)
                await session.onebot.setGroupBan(
                  session.channelId,
                  cache[player].id,
                  cache.time
                );
              return dedent`══恶魔轮盘══<br/>
                            ${h.at(
                              cache[player].id
                            )}倒在了桌前 -NEITHER HEAVEN NOR EARTH...<br/>
                            ${h.at(
                              cache[
                                player === "player1" ? "player2" : "player1"
                              ].id
                            )}获得了胜利，并带着一箱子钱离开了 -IS THIS WHAT U WANT?<br/>
                            游戏结束`;
            }
          } else {
            const damage = cache.double ? 2 : 1;
            cache[player === "player1" ? "player2" : "player1"].hp -= damage;
            result += `对方损失了${damage}点生命值`;
            if (cache[player === "player1" ? "player2" : "player1"].hp <= 0) {
              await session.send(result);
              delete game[session.channelId];
              if (cache.time)
                await session.onebot.setGroupBan(
                  session.channelId,
                  cache[player === "player1" ? "player2" : "player1"].id,
                  cache.time
                );
              return dedent`══恶魔轮盘══<br/>
                            ${h.at(
                              cache[
                                player === "player1" ? "player2" : "player1"
                              ].id
                            )}倒在了桌前 -NEITHER HEAVEN NOR EARTH...<br/>
                            ${h.at(
                              cache[player].id
                            )}获得了胜利，并带着一箱子钱离开了 -IS THIS WHAT U WANT?<br/>
                            游戏结束`;
            }
          }
        }

        if (bullet === "空包弹" && session.content === "自己") {
          result += "接下来还是你的回合";
        } else {
          if (!cache[`player${cache.currentTurn === 1 ? 2 : 1}`].handcuff) {
            cache.currentTurn = cache.currentTurn === 1 ? 2 : 1;
            player = `player${cache.currentTurn}`;
            result += `<br/>接下来是${h.at(cache[player].id)}的回合`;
            cache.usedHandcuff = false;
          } else {
            cache[`player${cache.currentTurn === 1 ? 2 : 1}`].handcuff = false;
            result += "<br/>因为对方被手铐铐住了，接下来还是你的回合";
          }
        }
        await session.send(result);
        if (cache.bullet.length === 0) {
          let back = nextRound(cache);
          cache = back.cache;
          await session.send(back.result);
        }
        cache.double = false;
        game[session.channelId] = cache;
      }
    } else if (
      game[session.channelId][
        `player${game[session.channelId].currentTurn}`
      ].item.includes(session.content) &&
      config.quickUse
    ) {
      if (
        game[session.channelId][`player${game[session.channelId].currentTurn}`]
          .id !== session.userId
      ) {
        return "现在不是你的回合";
      } else {
        let cache = game[session.channelId];
        let pick;
        if (session.content === "肾上腺素") {
          await session.send(
            "你给自己来了一针肾上腺素，请在30秒内发送你想选择的道具名"
          );
          pick = await session.prompt(30000);
          if (pick == null) {
            return "选择超时，已取消使用";
          } else if (
            !cache[`player${cache.currentTurn === 1 ? 2 : 1}`].item.includes(
              pick
            )
          ) {
            return "对方没有这个道具，已取消使用";
          } else if (pick === "肾上腺素") {
            return "不能选择肾上腺素";
          }
        }
        game[session.channelId] = cache;
        let back = itemList[session.content].use(
          session.channelId,
          game[session.channelId].currentTurn,
          pick
        );
        if (back.success) {
          game[session.channelId][
            `player${game[session.channelId].currentTurn}`
          ].item.splice(
            game[session.channelId][
              `player${game[session.channelId].currentTurn}`
            ].item.indexOf(session.content),
            1
          );
        }
        back.result.forEach(async (item) => {
          await session.send(item);
        });
      }
    } else {
      return next();
    }
  });

  function count(list: string[], key: string) {
    return list.filter((item) => item === key).length;
  }

  function nextRound(cache) {
    cache.round++;
    cache.bullet = Random.shuffle(Random.pick(bullets));
    let list = Object.keys(itemList);
    if (cache.round > 3) {
      list = list.filter((item) => item !== "香烟" && item !== "过期药物");
    }
    let itemCount = Random.int(2, 6);
    for (let i = 0; i < itemCount; i++) {
      cache[`player${cache.currentTurn}`].item.push(Random.pick(list));
      cache[`player${cache.currentTurn === 1 ? 2 : 1}`].item.push(
        Random.pick(list)
      );
    }
    cache.player1.item = cache.player1.item.slice(0, 8);
    cache.player2.item = cache.player2.item.slice(0, 8);
    return {
      cache: cache,
      result: dedent`══恶魔轮盘══
                    子弹打空了，进入下一轮${
                      cache.final ? "\n终极决战已开启，无法再获得回血道具" : ""
                    }
                    枪内目前有${count(cache.bullet, "实弹")}发实弹和${count(
        cache.bullet,
        "空包弹"
      )}发空包弹
                    双方获得${itemCount}个道具（道具上限为8个）<br/>`,
    };
  }
}
