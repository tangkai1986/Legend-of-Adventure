package main

import (
	"log"
	"strconv"
	"strings"
	"time"

	"./terrain"
)

const (
	WORLD_OVERWORLD  = "overworld"
	WORLD_MIRROR     = "mirror"
	WORLD_UNDERWORLD = "underworld"
)

type regionRequest struct {
	ID       string
	Receiver chan *Region
}

var regionCache = make(map[string]*Region)
var regionGetter = make(chan regionRequest, 64)
var startedRegionGetter = false

func startRegionGetter() {
	startedRegionGetter = true
	go func() {
		for {
			select {
			case request := <-regionGetter:
				world, x, y := getRegionData(request.ID)
				reg := new(Region)
				reg.World = world
				reg.X = x
				reg.Y = y
				reg.killer = make(chan bool)
				reg.doTTL()

				reg.entities = make([]*Entity, 0, 32)
				reg.terrain = *terrain.New(world, REGION_WIDTH, REGION_HEIGHT, x, y)

				// TODO: Do level building here.

				regionCache[request.ID] = reg

				request.Receiver <- reg
			}
		}
	}()
}

func getRegionID(world string, x int, y int) string {
	return world + ":" + strconv.Itoa(x) + ":" + strconv.Itoa(y)
}
func getRegionData(ID string) (string, int, int) {
	split := strings.Split(ID, ":")
	x, _ := strconv.ParseInt(split[1], 10, 0)
	y, _ := strconv.ParseInt(split[1], 10, 0)
	return split[0], int(x), int(y)
}

func GetRegion(world string, x int, y int) *Region {
	if !startedRegionGetter {
		startRegionGetter()
	}

	regionID := getRegionID(world, x, y)

	if reg, ok := regionCache[regionID]; ok {
		return reg
	}

	responseChan := make(chan *Region, 1)
	request := regionRequest{
		regionID,
		responseChan,
	}
	regionGetter <- request

	return <-responseChan
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

func (self *Region) RemoveEntity(entity Entity) {
	entity.Killer(self.killer)

	// Tell everyone else that the entity is leaving.
	self.Broadcast(
		self.GetEvent(REGION_EXIT, entity.ID(), entity),
		entity.ID(),
	)

	// Find the entity
	location := -1
	for i, e := range self.entities {
		if *e == entity {
			location = i
			break
		}
	}

	if location == -1 {
		log.Println("Could not find entity to remove!")
		return
	}

	// ...and remove it
	self.entities = append(self.entities[:location], self.entities[location+1:]...)

}

func (self Region) String() string {
	return self.terrain.String() + ", \"tileset\": \"tileset_default\", \"can_slide\": true"
}

func (self Region) IsTown() bool {
	return false
}
