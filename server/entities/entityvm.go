package entities

import (
    "io/ioutil"
    "log"

    "github.com/robertkrimen/otto"
)


var defaultVM = otto.New()
var defaultVMsetUp = false


type EntityVM struct {
    vm *otto.Otto
}

func (self *EntityVM) Copy() *EntityVM {
    vm := new(EntityVM)
    vm.vm = self.vm.Copy()
    vm.setup()
    return vm
}

func (self *EntityVM) setup() {
    self.vm.Set("import", func(call otto.FunctionCall) otto.Value {
        toImport := call.Argument(0).String()
        entity, err := ioutil.ReadFile("resources/entities/" + toImport + ".js")
        if err != nil {
            panic("Could not open entity '" + toImport + "'")
        }
        self.vm.Run(entity)
        return otto.Value {}
    })
}

func (self *EntityVM) Call(name string) string {
    value, err := self.vm.Run("JSON.stringify(trigger('" + name + "'))");
    if err != nil {
        log.Println("Entity JS error: ", err)
        return ""
    }
    return value.String()
}


// TODO: convert this to use channels to prevent race conditions
func GetFreshEntityVM() *EntityVM {

    if !defaultVMsetUp {
        framework, err := ioutil.ReadFile("resources/entities/framework.js")
        if err != nil {
            panic("Could not open entity framework file")
        }

        defaultVM.Run(framework)
    }

    return &EntityVM {
        defaultVM.Copy(),
    }
}


var defaultEntityCache = map[string]*EntityVM {}

// TODO: convert this to use channels to prevent race conditions
func GetEntityVM(entityName string) *EntityVM {
    if entity, ok := defaultEntityCache[entityName]; ok {
        return entity.Copy()
    }

    entity, err := ioutil.ReadFile("resources/entities/all/" + entityName + ".js")
    if err != nil {
        panic("Could not open entity '" + entityName + "'")
    }

    vm := GetFreshEntityVM()
    vm.vm.Run(entity)

    defaultEntityCache[entityName] = vm

    // Return a copy so the default one doesn't get tainted.
    return vm.Copy()
}
