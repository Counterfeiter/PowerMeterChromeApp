/* 
PowerMeter Chrome App
 Copyright (C) Sebastian Foerster

 This program is free software; you can redistribute it and/or
modify it under the terms of the GNU General Public License
as published by the Free Software Foundation; either version 2
of the License, or (at your option) any later version.

 This program is distributed in the hope that it will be useful,
 but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program; if not, write to the Free Software
Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
 
*/ 

(function () {
  var ui = {
    deviceSelector: null,
    connect: null,
    disconnect: null,
    inputLog: null,
    record: null,
    save: null,
    filter_select: null,
  };

  var connection = -1;
  var deviceMap = {};
  var pendingDeviceMap = {};
  var parser;

  var initializeWindow = function() {
    for (var k in ui) {
      var id = k.replace(/([A-Z])/, '-$1').toLowerCase();
      var element = document.getElementById(id);
      if (!element) {
        throw "Missing UI element: " + k;
      }
      ui[k] = element;
    }

    enableIOControls(false);

    ui.record.disabled = true;
    ui.save.disabled = true;

    ui.connect.addEventListener('click', onConnectClicked);
    ui.disconnect.addEventListener('click', onDisconnectClicked);
    ui.save.addEventListener('click', onSaveClicked);
    ui.record.addEventListener('click', onRecordClicked);
    displaychart();
    enumerateDevices();
  };

  var current_scale_range = 1.0;

  var UpdateGraph = function (scale_v, scale_c) {
      displaychart(scale_v, scale_c);
      current_scale_range = 1.0;
  };


  var UpdateData = function (voltage, current) {
      //autoscale the current axis -> only go up!
      var curr_pos = current > 0.0 ? current : -current;

      if (curr_pos > current_gauge.yAxis[0].max && curr_pos < current_gauge.yAxis[0].max * 2.0 && current_scale_range < 2.0) {
          displaychart(parser.scale_V, parser.scale_C * 2.0);
          current_scale_range = 2.0;
      } else if (curr_pos > current_gauge.yAxis[0].max && curr_pos < current_gauge.yAxis[0].max * 4.0 && current_scale_range < 4.0) {
          displaychart(parser.scale_V, parser.scale_C * 4.0);
          current_scale_range = 4.0;
      } else if (curr_pos > current_gauge.yAxis[0].max && curr_pos < current_gauge.yAxis[0].max * 8.0 && current_scale_range < 8.0) {
          displaychart(parser.scale_V, parser.scale_C * 8.0);
          current_scale_range = 8.0;
      }
      //display data
      voltage_gauge.series[0].points[0].update(voltage);
      current_gauge.series[0].points[0].update(current);
  };

  var isReceivePending = false;

  parser = new Proto_handler({
      scale_values_changed: UpdateGraph,
      new_data: UpdateData
  });

  var voltage_gauge;
  var current_gauge;

  var displaychart = function (scale_v, scale_c) {
      if (scale_c === undefined)
          scale_c = 0.00025;

      $("#voltmeter").highcharts({

            chart: {
                type: 'gauge',
                plotBackgroundColor: null,
                plotBackgroundImage: null,
                plotBorderWidth: 0,
                plotShadow: false
            },

            title: {
                text: 'Voltmeter'
            },

            plotOptions: {
                series: {
                    animation: {
                        duration: 1,
                        easing: 'linear',
                    }
                }
            },

            pane: {
                startAngle: -150,
                endAngle: 150,
                background: [{
                    backgroundColor: {
                        linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
                        stops: [
                            [0, '#FFF'],
                            [1, '#333']
                        ]
                    },
                    borderWidth: 0,
                    outerRadius: '109%'
                }, {
                    backgroundColor: {
                        linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
                        stops: [
                            [0, '#333'],
                            [1, '#FFF']
                        ]
                    },
                    borderWidth: 1,
                    outerRadius: '107%'
                }, {
                    // default background
                }, {
                    backgroundColor: '#DDD',
                    borderWidth: 0,
                    outerRadius: '105%',
                    innerRadius: '103%'
                }]
            },

            // the value axis
            yAxis: {
                min: 0,
                max: 32,

                minorTickInterval: 'auto',
                minorTickWidth: 1,
                minorTickLength: 10,
                minorTickPosition: 'inside',
                minorTickColor: '#666',

                tickPixelInterval: 4,
                tickWidth: 2,
                tickPosition: 'inside',
                tickLength: 10,
                tickColor: '#666',
                labels: {
                    step: 2,
                    rotation: 'auto'
                },
                title: {
                    text: 'U/V'
                },
                plotBands: [{
                    from: 0.0,
                    to: 16.0,
                    color: '#55BF3B' // green
                }, {
                    from: 16.0,
                    to: 26.0,
                    color: '#DDDF0D' // yellow
                }, {
                    from: 26.0,
                    to: 32.0,
                    color: '#DF5353' // red
                }]
            },
            tooltip: {
                enabled: false
            },

            series: [{
                name: 'Volt',
                data: [0],
            }]

        },
        // Add some life
        function (chart) {
            voltage_gauge = chart;
        });

      var curr = (4000 * scale_c);

      $("#currentmeter").highcharts({

          chart: {
              type: 'gauge',
              plotBackgroundColor: null,
              plotBackgroundImage: null,
              plotBorderWidth: 0,
              plotShadow: false
          },

          title: {
              text: 'Currentmeter'
          },

          plotOptions: {
              series: {
                  animation: {
                      duration: 1,
                      easing: 'linear',
                  }
              }
          },

          pane: {
              startAngle: -150,
              endAngle: 150,
              background: [{
                  backgroundColor: {
                      linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
                      stops: [
                          [0, '#FFF'],
                          [1, '#333']
                      ]
                  },
                  borderWidth: 0,
                  outerRadius: '109%'
              }, {
                  backgroundColor: {
                      linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
                      stops: [
                          [0, '#333'],
                          [1, '#FFF']
                      ]
                  },
                  borderWidth: 1,
                  outerRadius: '107%'
              }, {
                  // default background
              }, {
                  backgroundColor: '#DDD',
                  borderWidth: 0,
                  outerRadius: '105%',
                  innerRadius: '103%'
              }]
          },

          // the value axis
          yAxis: {
              min: -curr,
              max: +curr,

              minorTickInterval: 'auto',
              minorTickWidth: 0.5,
              minorTickLength: 10,
              minorTickPosition: 'inside',
              minorTickColor: '#666',

              tickPixelInterval: 10,
              tickWidth: 2,
              tickPosition: 'inside',
              tickLength: 10,
              tickColor: '#666',
              labels: {
                  step: 2,
                  rotation: 'auto'
              },
              title: {
                  text: 'I/A'
              },
              plotBands: [{
                  from: -0.95 * curr,
                  to: 0.95 * curr,
                  color: '#55BF3B' // green
              },
              {
                  from: 0.95 * curr,
                  to: curr,
                  color: '#DF5353' // red
              },
              {
                  from: -curr,
                  to: -0.95 * curr,
                  color: '#DF5353' // red
              }]
          },
          tooltip: {
              enabled: false
          },

          series: [{
              name: 'Ampere',
              data: [0],
          }]

      },
        // Add some life
        function (chart) {
            current_gauge = chart;
       });
  };

  var enableIOControls = function(ioEnabled) {
    ui.deviceSelector.disabled = ioEnabled;
    ui.connect.style.display = ioEnabled ? 'none' : 'inline';
    ui.disconnect.style.display = ioEnabled ? 'inline' : 'none';
  };

  var pendingDeviceEnumerations;
  var enumerateDevices = function() {
    var deviceIds = [];
    var permissions = chrome.runtime.getManifest().permissions;
    for (var i = 0; i < permissions.length; ++i) {
      var p = permissions[i];
      if (p.hasOwnProperty('usbDevices')) {
        deviceIds = deviceIds.concat(p.usbDevices);
      }
    }
    pendingDeviceEnumerations = 0;
    pendingDeviceMap = {};
    for (var i = 0; i < deviceIds.length; ++i) {
      ++pendingDeviceEnumerations;
      chrome.hid.getDevices(deviceIds[i], onDevicesEnumerated);
    }
  };

  var onDevicesEnumerated = function(devices) {
    for (var i = 0; i < devices.length; ++i) {
      pendingDeviceMap[devices[i].deviceId] = devices[i];
    }
    --pendingDeviceEnumerations;
    if (pendingDeviceEnumerations === 0) {
      var selectedIndex = ui.deviceSelector.selectedIndex;
      while (ui.deviceSelector.options.length)
        ui.deviceSelector.options.remove(0);
      deviceMap = pendingDeviceMap;
      for (var k in deviceMap) {
        ui.deviceSelector.options.add(
            new Option("Device #" + k + " [" +
                       deviceMap[k].vendorId.toString(16) + ":" +
                       deviceMap[k].productId.toString(16) + "]", k));
      }
      ui.deviceSelector.selectedIndex = selectedIndex;
      setTimeout(enumerateDevices, 1000);
    }
  };

  var onConnectClicked = function() {
    var selectedDevice = ui.deviceSelector.value;
    var deviceInfo = deviceMap[selectedDevice];
    if (!deviceInfo)
      return;
    chrome.hid.connect(deviceInfo.deviceId, function(connectInfo) {
      if (!connectInfo) {
        console.warn("Unable to connect to device.");
      }
      connection = connectInfo.connectionId;
      //start recv.ing
      pollForInput();
      enableIOControls(true);
      ui.record.disabled = false;
    });
  };

  var onDisconnectClicked = function() {
    if (connection === -1)
      return;
    chrome.hid.disconnect(connection, function () { });
    connection = -1;
    enableIOControls(false);
  };

  var pollForInput = function() {
    isReceivePending = true;
    chrome.hid.receive(connection, function(reportId, data) {
        isReceivePending = false;
        parser.parse_tpm2(new Uint8Array(data));
        if (connection !== -1) {
            setTimeout(pollForInput, 0);
        }
    });
  };

 var onSaveClicked = function() {
      counter = 0;

      var now_now = new Date();
      var now = new Date(now_now.getTime() - (now_now.getTimezoneOffset() * 60000));
      var now_string = now.toUTCString().replace(/[, :]/gi, '');
      //var now_string = now.toLocaleDateString('en-US').replace(/[, :]/gi, '');
      //var now_string = now.getYear().toString() + now.getMonth().toString() + now.getDay().toString() + now.getHours().toString() +
       //                 now.getMinutes().toString() + now.getSeconds().toString();

      var config = {
          type: 'saveFile',
          suggestedName: now_string,
          'accepts': [
              { 'description': 'CSV file (semicolon separated)', 'extensions': ['csv'] },
              { 'description': 'Text file (tab separated)', 'extensions': ['txt'] }
          ],
          acceptsAllTypes: false
      };
      chrome.fileSystem.chooseEntry(config, function (writableEntry) {
          parser.save_recorded_to_file(writableEntry, function (e) {
              //console.log('Write complete or error');
          });
      });
 };

 var onRecordClicked = function () {
     if (ui.record.childNodes[0].nodeValue == 'Start recording') {
         ui.record.childNodes[0].nodeValue = 'Stop recording';
         parser.start_recording(parseInt(ui.filter_select.value));
         ui.save.disabled = true;
     } else {
         ui.record.childNodes[0].nodeValue = 'Start recording';
         parser.stop_recording();
         ui.save.disabled = false;
     }
 };

  window.addEventListener('load', initializeWindow);
}());
