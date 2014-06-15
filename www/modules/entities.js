define('entities',
    ['canvases', 'comm', 'hitmapping', 'images', 'level', 'settings'],
    function(canvases, comm, hitmapping, images, level, settings) {

    'use strict';

    var registry = {};
    var follow = 'local';

    var avatarHeight = 32;
    var avatarWidth = 32;
    var avatarScale = settings.scales.entities;

    // Add entity
    comm.messages.on('add', function(body) {
        register(JSON.parse(body));
    });

    // Remove entity
    comm.messages.on('del', function(body) {
        if (!(body in registry)) return;
        delete registry[body];
    });

    // Change entity properties
    comm.messages.on('eup', function(body) {
        var data = JSON.parse(body);
        if (!data.id || !(data.id in registry)) return;
        var entity = registry[data.id];
        if ('x' in data) {
            entity.x = data.x;
        }
        if ('y' in data) {
            entity.y = data.y;
        }

        if (data.direction) {
            entity.direction[0] = data.direction[0] | 0;
            entity.direction[1] = data.direction[1] | 0;
        }

        if (data.velocity) {
            var oldVX = entity.velocity[0];
            var oldVY = entity.velocity[1];

            entity.velocity[0] = data.velocity[0] | 0;
            entity.velocity[1] = data.velocity[1] | 0;

            if (follow === data[0])
                require('level').setCenterPosition();

            var sp_dir = getSpriteDirection(entity.direction[0], entity.direction[1]);
            if (!entity.velocity[0] && !entity.velocity[1] && (oldVX || oldVY)) {
                entity.position = sp_dir[0].position;
            } else {
                entity.position = sp_dir[1].position;
            }
            entity.cycle_position = 0;
            entity.sprite_cycle = 0;
        }

        draw(data.id);
    });


    function register(props) {
        if (props.proto) {
            var eP = settings.entityPrototypes[props.proto]
            for (var k in eP) {
                if (!eP.hasOwnProperty(k)) continue;
                props[k] = eP[k];
            }
        }
        props.position = props.position || settings.entityPrototypes.avatar.sprite.down[0].position;
        props.velocity = props.velocity || [0, 0];
        props.direction = props.direction || [0, 1];
        props.hitmap = props.hitmap || [0, Infinity, Infinity, 0];
        props.cycle_position = 0;
        props.sprite_cycle = 0;

        props.clip = props.clip || false;

        props.canvas = document.createElement("canvas");
        props.canvas.width = props.width;
        props.canvas.height = props.height;

        registry[props.id] = props;
        draw(props.id);
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
        id: "local",
        proto: "avatar",
        x: 0,
        y: 0,
        direction: [0, 0]
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
        getLocal: function() {
            return registry.local;
        },
        getFollowing: getFollowing,
        getSpriteDirection: getSpriteDirection,
        register: register,
        draw: draw,
        tick: function(speed) {
            var doRedrawAVS = false;

            var spriteDirection;
            var a;
            var a_x;
            var a_y;
            for (var entity in registry) {
                a = registry[entity];
                a_x = a.velocity[0];
                a_y = a.velocity[1];
                if (!a_x && !a_y) continue;

                if (entity !== 'local') {
                    if (a_x && a_y) {
                        a_x *= Math.SQRT1_2;
                        a_y *= Math.SQRT1_2;
                    }
                    a.x += a_x * speed;
                    a.y += a_y * speed;
                }

                spriteDirection = getSpriteDirection(a.direction[0], a.direction[1]);
                if (a.sprite_cycle++ === spriteDirection[a.cycle_position].duration) {
                    a.sprite_cycle = 0;
                    a.cycle_position = a.cycle_position + 1 === 3 ? 1 : 2;
                    a.position = spriteDirection[a.cycle_position].position;
                    draw(entity);
                }
                doRedrawAVS = true;
            }

            return doRedrawAVS;
        },
        drawAll: function(context, state) {
            var entities = [];

            // Ignore entities that are not onscreen.
            var entity;
            for (entity in registry) {
                var a = registry[entity];
                if (state[0] > 0 && (a.x < (state[0] - 1) / settings.tilesize ||
                                     a.x > (state[0] + state[2] + 1) / settings.tilesize) ||
                    state[1] > 0 && (a.y < (state[1] - 1) / settings.tilesize ||
                                     a.y > (state[1] + state[3] + 1) / settings.tilesize)) {
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

            // Draw each entity in turn.
            for(var i = 0; i < entities.length; i++) {
                entity = entities[i];
                context.drawImage(
                    entity.canvas,
                    0, 0, entity.canvas.width, entity.canvas.height,
                    (entity.x * settings.tilesize) + entity.xOffset - state[0],
                    (entity.y * settings.tilesize) - entity.height - state[1],
                    entity.width, entity.height
                );
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
        }
    };
});