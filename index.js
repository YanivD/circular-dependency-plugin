let path = require('path')
let extend = require('util')._extend
let cwd = process.cwd()
let BASE_ERROR = 'Circular dependency detected:\r\n'

class CircularDependencyPlugin {
  constructor(options) {
    this.options = extend({
      exclude: new RegExp('$^'),
      failOnError: false,
      onDetected: false
    }, options)
  }

  apply(compiler) {
    let plugin = this

    compiler.plugin('done', function(stats) {
      let modules = stats.compilation.modules

      for (let module of modules) {
        if (module.resource === undefined) { continue }

        let maybeCyclicalPathsList = isCyclic(module, module, {})
        if (maybeCyclicalPathsList) {
          // allow consumers to override all behavior with onDetected
          if (plugin.options.onDetected) {
            try {
              plugin.options.onDetected({
                paths: maybeCyclicalPathsList,
                compilation: stats.compilation
              })
            } catch(err) {
              stats.compilation.errors.push(err)
            }
            continue
          }

          // exclude modules based on regex test
          if (plugin.options.exclude.test(module.resource)) {
            continue
          }

          // mark warnings or errors on webpack compilation
          let error = new Error(BASE_ERROR.concat(maybeCyclicalPathsList.join(' -> ')))
          if (plugin.options.failOnError) {
            stats.compilation.errors.push(error)
          } else {
            stats.compilation.warnings.push(error)
          }
        }
      }
    })
  }
}

function isCyclic(initialModule, currentModule, seenModules) {
  // Add the current module to the seen modules cache
  seenModules[currentModule.id] = true

  // If the modules aren't associated to resources
  // it's not possible to display how they are cyclical
  if (!currentModule.resource || !initialModule.resource) {
    return false
  }

  // Iterate over the current modules dependencies
  for (let dependency of currentModule.dependencies) {
    let depModule = dependency.module
    if (!depModule) { continue }

    if (depModule.id in seenModules) {
      if (depModule.id === initialModule.id) {
        // Initial module has a circular dependency
        return [
          path.relative(cwd, currentModule.resource),
          path.relative(cwd, depModule.resource)
        ]
      }
      // Found a cycle, but not for this module
      continue
    }

    let maybeCyclicalPathsList = isCyclic(initialModule, depModule, seenModules)
    if (maybeCyclicalPathsList) {
      maybeCyclicalPathsList.unshift(path.relative(cwd, currentModule.resource))
      return maybeCyclicalPathsList
    }
  }

  return false
}

module.exports = CircularDependencyPlugin
