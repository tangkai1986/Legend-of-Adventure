define('entities',
    ['canvases', 'comm', 'entitymovement', 'hitmapping', 'images', 'level', 'settings'],
    function(canvases, comm, entitymovement, hitmapping, images, level, settings) {

    'use strict';

    var registry = {};
    var follow = 'local';

    var avatarHeight = 32;
    var avatarWidth = 32;
    var avatarScale = settings.scales.entities;

    // Add entity
    comm.messages.on('add', function(body) {
        var break_ = body.indexOf('\n');
        if (break_ !== -1) {
            body = body.substr(0, break_);
        }

        register(JSON.parse(body));
    });

    // Remove entity
    comm.messages.on('del', function(body) {
        if (!(body in registry)) return;
        delete registry[body];
    });

    // Change entity properties
    comm.messages.on('epu', function(body, origin) {
        if (!origin || !(origin in registry)) return;

        var break_ = body.indexOf('\n');
        if (break_ !== -1) {
            body = body.substr(0, break_);
        }

        var data = JSON.parse(body);
        var entity = registry[origin];
        if ('x' in data) {
            entity.x = data.x;
            delete data.x;
        }
        if ('y' in data) {
            entity.y = data.y;
            delete data.y;
        }

        if (data.direction) {
            entity.direction[0] = data.direction[0] | 0;
            entity.direction[1] = data.direction[1] | 0;
            delete data.direction;
        }

        if (data.velocity) {
            var oldVX = entity.velocity[0];
            var oldVY = entity.velocity[1];

            entity.velocity[0] = data.velocity[0] | 0;
            entity.velocity[1] = data.velocity[1] | 0;

            var sp_dir = getSpriteDirection(entity.direction[0], entity.direction[1]);
            if (!entity.velocity[0] && !entity.velocity[1] && (oldVX || oldVY)) {
                entity.position = sp_dir[0].position;
            } else {
                entity.position = sp_dir[1].position;
            }
            entity.cycle_position = 0;
            entity.sprite_cycle = 0;
            delete data.velocity;
        }

        if ('nametag' in data) {
            entity.nametag = data.nametag;
            delete data.nametag;
        }

        if ('width' in data) {
            data.width *= settings.tilesize;
        }

        if ('height' in data) {
            data.height *= settings.tilesize;
        }

        for (var key in data) {
            if (!data.hasOwnProperty(key)) continue;
            entity[key] = data[key];
        }

        if (follow === origin) {
            require('level').setCenterPosition();
        }

        draw(origin);
    });


    function register(props) {
        const entity = {
            created: Date.now(),

            position: settings.entityPrototypes.avatar.sprite.down[0].position,
            xOffset: 0,
            velocity: [0, 0],
            direction: [0, 1],
            hitmap: [0, Infinity, Infinity, 0],

            cycle_position: 0,
            sprite_cycle: 0,

            clip: false,
            composite: null,
            particles: [],
        };

        Object.assign(entity, props, props.proto ? settings.entityPrototypes[props.proto] : null);

        entity.width *= settings.tilesize;
        entity.height *= settings.tilesize;

        entity.canvas = document.createElement('canvas');
        entity.canvas.width = entity.width;
        entity.canvas.height = entity.height;

        registry[props.eid] = entity;
        draw(entity.eid);
    }

    function draw(id) {
        var entity = registry[id];
        var context = entity.canvas.getContext('2d');
        canvases.prepareContext(context);

        images.waitFor(entity.image).done(function(img) {
            context.clearRect(0, 0, entity.width, entity.height);
            if (entity.sprite) {
                context.drawImage(
                    img,
                    (entity.position % 3) * img.width / 3, (entity.position / 3 | 0) * img.height / 4,
                    img.width / 3, img.height / 4,
                    0, 0, entity.width, entity.height
                );
            } else if (entity.clip) {
                context.drawImage(
                    img,
                    entity.clip.x,
                    entity.clip.y,
                    entity.clip.width,
                    entity.clip.height,
                    0, 0, entity.width, entity.height
                );
            } else {
                context.drawImage(
                    img,
                    0, 0, img.width, img.height
                );
            }
        });
    }

    function getFollowing() {
        return registry[follow];
    }

    function getSpriteDirection(x, y) {
        if (x < 0)
            return settings.entityPrototypes.avatar.sprite.left;
        else if (x > 0)
            return settings.entityPrototypes.avatar.sprite.right;
        else if (y < 0)
            return settings.entityPrototypes.avatar.sprite.up;
        else
            return settings.entityPrototypes.avatar.sprite.down;
    }

    register({
        eid: 'local',
        proto: 'avatar',
        x: 0,
        y: 0,
        direction: [0, 0],
        speed: 0.0075,
        particles: []
    });

    var firstLevel = true;
    level.on('newLevel', function(width, height, hitmap) {
        var entity = registry.local;
        if (firstLevel) {
            entity.x = width / 2;
            entity.y = height / 2;
            firstLevel = false;
        }
        if(hitmap) {
            hitmapping.updateAvatarX(entity, hitmap);
            hitmapping.updateAvatarY(entity, hitmap);
        }
    });

    level.on('unload', function() {
        for (var entity in registry) {
            if (entity === 'local') continue;
            delete registry[entity];
        }
        follow = 'local';
    });

    return {
        registry,

        getLocal: function() {
            return registry.local;
        },
        getFollowing: getFollowing,
        getSpriteDirection: getSpriteDirection,
        register: register,
        draw: draw,
        tick: function(ms) {
            var spriteDirection;
            var a;
            var a_x;
            var a_y;
            for (var entity in registry) {
                a = registry[entity];

                if (a.particles.length) {
                    for (var i = a.particles.length - 1; i >= 0; i--) {
                        if (a.particles[i].tick()) {
                            a.particles.splice(i, 1);
                        }
                    }
                }

                a_x = a.velocity[0];
                a_y = a.velocity[1];
                if (!a_x && !a_y) continue;

                if (entity !== 'local') {
                    if (a_x && a_y) {
                        a_x *= Math.SQRT1_2;
                        a_y *= Math.SQRT1_2;
                    }
                    a.x += a_x * a.speed * ms;
                    a.y += a_y * a.speed * ms;
                }

                spriteDirection = getSpriteDirection(a.direction[0], a.direction[1]);
                if (a.sprite_cycle++ === spriteDirection[a.cycle_position].duration) {
                    a.sprite_cycle = 0;
                    a.cycle_position = a.cycle_position + 1 === 3 ? 1 : 2;
                    a.position = spriteDirection[a.cycle_position].position;
                    draw(entity);
                }
            }
        },
        drawAll: function(context, state) {
            var now = Date.now();
            var entities = [];

            // Ignore entities that are not onscreen.
            var entity;
            for (entity in registry) {
                var a = registry[entity];
                if (state[0] > 0 && (a.x < (state[0] - 1) / settings.tilesize ||
                                     a.x > (state[0] + state[2] + 1) / settings.tilesize) ||
                    state[1] > 0 && (a.y < (state[1] - 1) / settings.tilesize ||
                                     a.y - a.height > (state[1] + state[3] + 1) / settings.tilesize)) {
                    continue
                }
                entities.push(a);
            }

            // Sort such that entities with a lower Y are further back.
            if (entities.length > 1) {
                entities.sort(function(a, b) {
                    return a.y - b.y;
                });
            }

            var destX;
            var destY;
            var temp;
            var comp;

            var origCO = context.globalCompositeOperation;

            // Draw each entity in turn.
            for(var i = 0; i < entities.length; i++) {
                entity = entities[i];
                comp = entity.composite;

                destX = entity.x * settings.tilesize + entity.xOffset - state[0];
                destY = entity.y * settings.tilesize - entity.height - state[1];

                if (entity.movement) {
                    destX += entitymovement[entity.movement + '_x'](now - entity.created);
                    destY += entitymovement[entity.movement + '_y'](now - entity.created);
                }

                if (entity.eid === 'local') {
                    if (settings.effect === 'flip') {
                        context.save();
                        context.scale(1, -1);
                        destY *= -1;
                        destY -= entity.height;
                    } else if (settings.effect === 'invincible') {
                        comp = 'difference';
                    }
                }

                if (comp) {
                    context.globalCompositeOperation = comp;
                }

                context.drawImage(
                    entity.canvas,
                    0, 0, entity.canvas.width, entity.canvas.height,
                    destX, destY,
                    entity.width, entity.height
                );

                if (entity.eid === 'local') {
                    if (settings.effect === 'flip') {
                        context.restore();
                    }
                }
                if (comp) {
                    context.globalCompositeOperation = origCO;
                }

                if (entity.nametag) {
                    context.font = '30px VT323';
                    temp = context.measureText(entity.nametag);
                    context.fillStyle = 'rgba(0, 0, 0, 0.2)';
                    context.fillRect(
                        (entity.width / 2 + destX) - (temp.width + 20) / 2,
                        (destY - 10) - 15 - 20,
                        temp.width + 20,
                        15 + 20
                    );
                    context.fillStyle = '#000';
                    context.fillText(
                        entity.nametag,
                        (entity.width / 2 + destX) - temp.width / 2 + 2,
                        (destY - 10) - 10 + 2
                    );
                    context.fillStyle = '#fff';
                    context.fillText(
                        entity.nametag,
                        (entity.width / 2 + destX) - temp.width / 2,
                        (destY - 10) - 10
                    );
                }

                if (entity.particles.length) {
                    for (var j = 0; j < entity.particles.length; j++) {
                        entity.particles[j].draw(
                            context,
                            entity.x * settings.tilesize - state[0],
                            entity.y * settings.tilesize - state[1]
                        );
                    }
                }
            }
        },
        drawHitmappings: function(context, state) {
            var local = registry.local;
            context.lineWidth = 3;
            context.strokeStyle = 'red';
            context.strokeRect(
                local.hitmap[3] * settings.tilesize - state[0],
                local.hitmap[0] * settings.tilesize - state[1],
                (local.hitmap[1] - local.hitmap[3]) * settings.tilesize,
                (local.hitmap[2] - local.hitmap[0]) * settings.tilesize
            );
        },
        resetFollow: function() {
            follow = 'local';
        },
        addParticle: function(eid, particle) {
            if (!registry[eid]) return;
            registry[eid].particles.push(particle);
        }
    };
});
