package main

import (
	"log"
	"strconv"
	"time"

	"./terrain"
)

const (
	WORLD_OVERWORLD  = "overworld"
	WORLD_MIRROR     = "mirror"
	WORLD_UNDERWORLD = "underworld"
)

var regionCache = make(map[string]*Region)

func getRegionID(world string, x int, y int) string {
	return world + ":" + strconv.Itoa(x) + ":" + strconv.Itoa(y)
}

func GetRegion(world string, x int, y int) *Region {
	regionID := getRegionID(world, x, y)
	reg, ok := regionCache[regionID]
	if ok {
		return reg
	}

	// FIXME: There might be a very slim race condition here, where two
	// clients can create a new region simultaneously.
	reg = new(Region)
	regionCache[regionID] = reg
	reg.World = world
	reg.X = x
	reg.Y = y
	reg.killer = make(chan bool)
	reg.doTTL()

	reg.terrain = *terrain.New(world, REGION_WIDTH, REGION_HEIGHT, x, y)
	// TODO: Do level building here

	reg.entities = make([]*Entity, 0, 32)

	return reg
}

type Region struct {
	World string
	X, Y  int

	// Bits and pieces to clean up the region.
	KeepAlive chan bool
	killer    chan bool

	terrain  terrain.Terrain
	entities []*Entity
}

func (self *Region) Broadcast(evt *Event, except string) {
	for _, entity := range self.entities {
		if (*entity).ID() == except {
			continue
		}
		(*entity).Receive() <- evt
	}
}

func (self *Region) doTTL() {
	self.KeepAlive = make(chan bool)
	go func(self *Region) {
		for {
			select {
			case <-self.KeepAlive:
				log.Println("Keeping region " + self.ID() + " alive.")

			case <-time.After(2 * time.Minute):
				log.Println("Region " + self.ID() + " timed out.")
				// Remove references to the region from the region cache.
				delete(regionCache, self.ID())
				// Tell the entities that are listening that they need to clean up.
				self.killer <- true
				close(self.KeepAlive)

				return
			}
		}
	}(self)
}

func (self Region) ID() string {
	return getRegionID(self.World, self.X, self.Y)
}

func (self *Region) GetEvent(evt_type EventType, body string, origin Entity) *Event {
	str_origin := ""
	if origin != nil {
		str_origin = origin.ID()
	}

	return &Event{self.ID(), evt_type, str_origin, GetOriginServerID(), body}
}

func (self *Region) AddEntity(entity Entity) {
	entity.Killer(self.killer)

	// Tell everyone else that the entity is here.
	self.Broadcast(
		self.GetEvent(REGION_ENTRANCE, entity.GetIntroduction(), entity),
		entity.ID(),
	)

	// Tell the entity about everyone else.
	for _, regEnt := range self.entities {
		entity.Receive() <- self.GetEvent(REGION_ENTRANCE, (*regEnt).GetIntroduction(), *regEnt)
	}

	// Add the entity to the list of entities.
	self.entities = append(self.entities, &entity)

}

func (self Region) String() string {
	return self.terrain.String() + ", \"tileset\": \"tileset_default\", \"can_slide\": true"
}
