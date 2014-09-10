'use strict'
var path = require('path'),
    gutil = require('gulp-util'),
    through = require('through2'),
    handlebar = require('handlebars'),
    fs = require('fs'),
    execFile = require('child_process').execFile;

module.exports = function (options) {
  options = options || {};

  var cleanup = function(path) {
    fs.unlink(path);
  };
 
  //If we are processing integration tests with phantomjs
  if(!!options.integration) {

    // Reference to the file paths piped in
    var filePaths = [];
    gutil.log('Running Jasmine with PhantomJS');
    
    return through.obj(
      function (file, encoding, callback) {
        
        if (file.isNull()) {
          callback(null, file);
          return;
        }
        
        // Currently not supporting streams
        if (file.isStream()) {
          callback(new gutil.PluginError('gulp-jasmine-phantom', 'Streaming not supported'));
        }
        
        filePaths.push(file.path);
        callback(null, file);
      }, function (callback) {
  
        // Create the specRunner.html file from the template
        fs.readFile(path.join(__dirname, '/lib/specRunner.handlebars'), 'utf8', function(error, data) {
          if (error) throw error;

          var specData = handlebar.compile(data),
              specCompiled = specData({files: filePaths});
          
          // Write out the spec runner file
          fs.writeFile('./lib/specRunner.html', specData({files: filePaths}), function(error) {
            if (error) throw error;

            var childArgs = [
              path.join(__dirname, '/lib/jasmine-runner.js'),
              path.join(__dirname, '/lib/specRunner.html')
            ];
            
            // Execute the file with phantomjs
            execFile('phantomjs', childArgs, function(error, stdout, stderr) {
              gutil.log('Start running specs');
              console.log(stdout);

              if (stderr !== '') {
                  gutil.log('gulp-jasmine-phantom: Failed to open test runner ' + gutil.colors.blue(childArgs[1]));
                  gutil.log(gutil.colors.red('error: '), stderr);
              }

              if(options.keepRunner === undefined || options.keepRunner === false) {
                cleanup(childArgs[1]);
              }
            }.bind(this));
          });
        });

      } 
    );
  } else {
    var miniJasmineLib = require('minijasminenode2'),
        terminalReporter = require('./lib/terminal-reporter.js').TerminalReporter;
    gutil.log('Running Jasmine with minijasminenode2');
    return through.obj(
        // -----------------
        // Transform function
        // Takes in each file and adds it to the list of specs
        // -----------------
        function(file, encoding, callback) {
          // If file is null exit with callback
          if (file.isNull()) {
            callback(null, file);
            return;
          }
          
          // -----------------
          // Currently do not support streams
          // -----------------
          if (file.isStream()) {
            callback(new gutil.PluginError('gulp-jasmine-phantom', 'Streaming not supported'));
            return;
          }
          

        miniJasmineLib.addSpecs(file.path);
        callback(null, file);
      }, 
      // -----------------
      // Flush function
      // Finishes up the stream and runs all the test cases that have been provided
      // -----------------
      function(callback) {
        try {
          miniJasmineLib.executeSpecs({
            reporter: new terminalReporter({}),
            showColors: true,
            includeStackTrace: true,
            onComplete: function(passed) {
              if(passed) {
                callback(null);
              } else {
                callback(new gutil.PluginError('gulp-jasmine-phantom', 'Tests failed', {showStack: false}));
              }
            }
          });
        } catch(error) {
          callback(new gutil.PluginError('gulp-jasmine-phantom', error));
        }
      }
    );
  }

};
