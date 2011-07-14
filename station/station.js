// Copyright 2011 Google Inc. All Rights Reserved.
// 
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
// 
//     http://www.apache.org/licenses/LICENSE-2.0
// 
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.


var topDiv;
var instanceInfo;
var capServer = new CapServer();

var defaultTools = [
    { name: 'Hello',
      icon: 'http://localhost:9002/tool-hello.png',
      generate: 'http://localhost:9002/belay/generate'
    },
    { name: 'Sticky',
      icon: 'http://localhost:9003/tool-stickies.png',
      url: 'http://localhost:9003/generate'
    },
    { name: 'Buzzer',
      icon: 'http://localhost:9004/tool-buzzer.png',
      url: 'http://localhost:9004/generate'
    },
    { name: 'Emote',
      icon: 'http://localhost:9005/tool-emote.png',
      url: 'http://localhost:9005/generate'
    },
    { name: 'bfriendr',
      icon: 'http://localhost:9001/tool.png',
      url: 'http://localhost:9009/generate'
    }
  ];

var capture1 = function(f, a) { return function() { return f(a); } };

//
// Desk top area
//
var resizeDesk = function(s) {
  //topDiv.find('#belay-station-outer').width(s.w);
  topDiv.find('#belay-desk').height(s.h);
  return false;
};
var setupDeskSizes = function(top) {
  var controls = top.find('#belay-controls');
  var deskSizes = {
    small: {w: 600, h: 350},
    medium: {w: 1200, h: 650},
    large: {w: 2200, h: 1200} };
  for (var p in deskSizes) {
    var s = deskSizes[p];
    controls.append('<a href="#">' + p + '</a> ');
    controls.find(':last-child').click(capture1(resizeDesk, s));
  }
};

//
// Testing
//
var setupTestButton = function(top, f) {
  var controls = top.find('#belay-controls');
  controls.append('<a href="#">test</a>');
  controls.find(':last-child').click(f);
};

//
// Instance Data
//
var instances = {};
  // a map from instanceIDs to
  //  { id: uuid,       -- the id of this instance
  //    icap: url,      -- the URL of where to store/fetch the info
  //    info: { },      -- the stored state of this instance
  //    capServer: caps -- the cap server for this instance (if !info.remote)
  //    capTunnel: capt -- the cap tunnel for this instance (if info.remote)
  //  }

var dirtyInstances = [];
var dirtyProcess = function() {
  if (dirtyInstances.length <= 0) { return; }
  var instID = dirtyInstances.shift();
  var inst = instances[instID];
  inst.info.capSnapshot = inst.capServer.snapshot();
  inst.icap.post(inst.info);
  if (dirtyInstances.length > 0) {
    setTimeout(dirtyProcess, 1000);
  }
};
var dirty = function(inst) {
  var instID = inst.id;
  if (dirtyInstances.indexOf(instID) >= 0) return;
  dirtyInstances.push(instID);
  if (dirtyInstances.length > 1) return;
  setTimeout(dirtyProcess, 1000);
};
var ensureSync = function(inst, k) {
  var ix = dirtyInstances.indexOf(inst.id);
  if (ix == -1) { k(); }
  else {
    inst.info.capSnapshot = inst.capServer.snapshot();
    dirtyInstances.splice(ix, 1);
    inst.icap.post(inst.info, k);
  }
};

//
// CapServers
//
var instanceResolver = function(id) {
  if (instances[id] && !instances[id].info.remote) {
    return instances[id].capServer.publicInterface;
  }
  if (instances[id] && instances[id].info.remote) {
    return instances[id].capTunnel.sendInterface;
  }
  if (id === capServer.instanceID) {
    return capServer.publicInterface;
  }
  return null;
};

capServer.setResolver(instanceResolver);

var setupCapServer = function(inst) {
  var capServer;
  if ('capSnapshot' in inst.info) {
    capServer = new CapServer(inst.info.capSnapshot);
  }
  else {
    capServer = new CapServer();
    inst.id = capServer.instanceID;
  }
  inst.capServer = capServer;
  capServer.setResolver(instanceResolver);
};

var setupCapTunnel = function(instID, port) {
  var tunnel = new CapTunnel(port);
  var instance;
  if (instances[instID]) {
    instance = instances[instID];
  }
  else { throw 'Creating a tunnel for non-existent instanceID!'; }

  instance.capServer = undefined;
  instance.capTunnel = tunnel;

  tunnel.setLocalResolver(instanceResolver);
};


//
// Dragging Support
//
var capDraggingInfo;
  // HACK: only works so long as only one drag in process at a time

var startDrag = function(info) {
  capDraggingInfo = info;
  info.node.addClass('belay-selected');
};
var stopDrag = function(info) {
  capDraggingInfo = undefined;
  info.node.removeClass('belay-selected');
};
var startDropHover = function(node, rc) {
  node.addClass('belay-selected');
  var sources = topDiv.find('.belay-cap-source');
  if (rc == '*') {
    sources.addClass('belay-possible');
  } else {
    for (var i = 0; i < sources.length; ++i) {
      var s = sources.eq(i);
      if (s.data('rc') == rc) s.addClass('belay-possible');
    }    
  }
};
var stopDropHover = function(node, rc) {
  node.removeClass('belay-selected');
  topDiv.find('.belay-cap-source').removeClass('belay-possible');
};

var desk = undefined;
var protoContainer = undefined;

var launchEmbeddedInstance = function(inst) {
  // TODO(jpolitz) check if inst.info claims to be remote, and pop out
  var instInfo = inst.info;
  var container = protoContainer.clone();
  var header = container.find('.belay-container-header');
  var holder = container.find('.belay-container-holder');
  holder.empty();
  container.appendTo(desk);
  container.css('left', instInfo.window.left)
           .css('top', instInfo.window.top)
           .width(instInfo.window.width || '10em')
           .height(instInfo.window.height || '6em');
  var extras = {
    storage: {
      get: function() { return instInfo.data; },
      put: function(d) { instInfo.data = d; dirty(inst); }
    },
    capServer: inst.capServer,
    ui: {
      resize: function(minWidth, minHeight, resizable) {
        if (resizable) {
          container.resizable({
            containment: desk,
            handles: 'se',
            minWidth: minWidth,
            minHeight: minHeight,
            stop: function(ev, ui) {
              instInfo.window.width = container.width();
              instInfo.window.height = container.height();
              dirty(inst);
            }
          });
          if (container.width() < minWidth) container.width(minWidth);
          if (container.height() < minHeight) container.height(minHeight);
        }
        else {
          container.resizable('destroy');
          if (container.width() != minWidth ||
              container.height() != minHeight) {
            container.width(minWidth);
            container.height(minHeight);
            instInfo.window.width = container.width();
            instInfo.window.height = container.height();
            dirty(inst);
          }
        }
      },
      capDraggable: function(node, rc, generator) {
        var helper = node.clone();
        var info = {
          node: node,
          resourceClass: rc,
          generator: function(rc) {
            var cap = generator(rc);
            dirty(inst);
            return cap.serialize();
          }
        };
        node.data('rc', rc);
        node.draggable({
          appendTo: desk,
          helper: function() { return helper; },
          start: function() { startDrag(info); },
          stop: function() { stopDrag(info); },
          scope: 'default',
          zIndex: 9999
        });
        node.addClass('belay-cap-source');
      },
      capDroppable: function(node, rc, acceptor) {
        node.droppable({
          scope: 'default',
          activeClass: 'belay-possible',
          hoverClass: 'belay-selected',
          drop: function(evt, ui) {
            var info = capDraggingInfo;
            acceptor(info.generator(info.resourceClass), info.resourceClass);
          },
          accept: function(elt) {
            return (rc === '*') || (elt.data('rc') === rc);
          }
        });

        // Note:  Without preventDf on dragenter and dragover, the
        // browser will not send the drop event
        var preventDf = function(e) {
          e.originalEvent.preventDefault();
          return false;
        };
        node.bind('dragenter', preventDf);
        node.bind('dragover', preventDf);
        node.bind('drop', function(e) {
          if (!e.originalEvent.dataTransfer) return;
          var data = e.originalEvent.dataTransfer.getData('text/plain');
          if (!data)
            data = e.originalEvent.dataTransfer.getData('text/uri-list');
          if (!data) return;
          var qLoc = data.indexOf('?');
          data = qLoc == -1 ? data : data.slice(qLoc);
          var params = jQuery.parseQuery(data);
          var scope = params.scope;
          var cap = params.cap;

          if (scope == rc) {
            acceptor(capServer.restore(cap));
          }
        });

        node.addClass('belay-cap-target');
        node.hover(
          function() { startDropHover(node, rc); },
          function() { stopDropHover(node, rc); });
      }
    }
  };

  container.draggable({
    containment: desk,
    cursor: 'crosshair',
    // handle: container.find('.belay-container-header'),
    stack: '.belay-container',
    stop: function(ev, ui) {
      instInfo.window.left = container.css('left');
      instInfo.window.top = container.css('top');
      dirty(inst);
    }
  });

  header.append('<div class="belay-control">×</div>');
  var closeBox = header.find(':last-child');
  closeBox.click(function() {
    inst.capServer.revokeAll();
    delete instances[inst.id];
    container.hide(function() { container.remove(); });
    inst.icap.remove(function() {}, function() {});
  });
  closeBox.hover(function() { closeBox.addClass('hover'); },
                 function() { closeBox.removeClass('hover'); });

  header.append('<div class="belay-control">↑</div>');
  var maxBox = header.find(':last-child');
  maxBox.click(function() {
    container.hide(function() { container.remove(); });
    launchExternal(inst);
  });
  maxBox.hover(function() { maxBox.addClass('hover'); },
               function() { maxBox.removeClass('hover'); });

  dirty(inst);

  foop(instInfo.iurl, holder, extras);
};

var launchWindowedInstance = function(inst) {
  // TODO(jpolitz) check if inst.info claims to be remote, and pop out
  var instInfo = inst.info;
  
  // TODO(mzero) create cap for storage to station
  // gets/puts from instInfo.data, and dirty(inst) on put
  
  dirty(inst);
  instInfo.belayInstance.get(function(launch) {
    var port = windowManager.open(launch.page, inst.id);
    setupCapTunnel(inst.id, port);
    inst.capTunnel.sendOutpost(undefined, { launch: launch });    
  });
};

var launchInstance = function(inst) {
    if ('belayInstance' in inst.info) return launchWindowedInstance(inst);
    if ('iurl' in inst.info)          return launchEmbeddedInstance(inst);
};

var windowOptions = function(inst) {
  var width = inst.info.window.width;
  // NOTE(jpolitz): offset below is to deal with the window's frame
  var height = inst.info.window.height + 12;
  return "width=" + width + ",height=" + height;
};

var launchExternal = function(inst) {
  inst.info.remote = true;
  dirty(inst);
  ensureSync(inst, function() {
    var port = windowManager.open(
        'http://localhost:9000/subbelay?url=' +
                encodeURI('http://localhost:9001/substation.js'),
        inst.id,
        windowOptions(inst));
    setupCapTunnel(inst.id, port);
    var restoreCap = capServer.grant(function() {
        getAndLaunchInstance(inst.icap);
        return true;
      });
    inst.capTunnel.initializeAsOutpost(capServer, [inst.icap, restoreCap]);
  });
};

var getAndLaunchInstance = function(icap) {
  icap.get(function(instInfo) {
    var inst = {
      icap: icap,
      info: instInfo
    };
    setupCapServer(inst);
    inst.id = inst.capServer.instanceID; // TODO(mzero): hack!
    instances[inst.id] = inst;
    if (instInfo.remote) launchExternal(inst);
    else launchInstance(inst);
  },
  function(status) { alert('Failed to load instance: ' + status); });
};

var initialize = function(instanceCaps) {
  var top = topDiv;
  var toolbar = top.find('#belay-toolbar');
  desk = top.find('#belay-desk');

  var protoTool = toolbar.find('.belay-tool').eq(0).detach();
  toolbar.find('.belay-tool').remove(); // remove the rest

  protoContainer = desk.find('.belay-container').eq(0).detach();
  desk.find('.belay-container').remove(); // remove the rest

  setupDeskSizes(top);
  setupTestButton(top, function() { alert('test!'); });

  var nextLeft = 100;
  var nextTop = 50;


  var createEmbeddedInstanceFromTool = function(info) {
    $.ajax({
      url: info.url,
      dataType: 'text',
      success: function(data, status, xhr) {
        var inst = {
          info: {
            remote: false,
            iurl: data,
            info: undefined,
            window: { top: nextTop += 10, left: nextLeft += 20}
          }
        };
        setupCapServer(inst);
        // TODO(arjun) still a hack. Should we be concatenaing URLs here?
        inst.icap = capServer.grant(instanceInfo.instanceBase + inst.id);
        instances[inst.id] = inst;
        launchInstance(inst);
        dirty(inst);
      },
      error: function(xhr, status, error) {
        alert('Failed to createEmbededInstanceFromTool ' + info.name + ', status = ' + status);
      }
    });
  };

  var createWindowedInstanceFromTool = function(info) {
    capServer.restore(info.generate).get(
      function(data) {
        var inst = {
          info: {
            belayInstance: data,
            info: undefined,
          }
        };
        setupCapServer(inst);
        // TODO(arjun) still a hack. Should we be concatenaing URLs here?
        inst.icap = capServer.grant(instanceInfo.instanceBase + inst.id);
        instances[inst.id] = inst;
        launchInstance(inst);
        dirty(inst);
      },
      function(error) {
        alert('Failed to createInstanceFromTool ' + info.name +
          ', error = ' + error);
      }
    );
  };

  var createInstanceFromTool = function(info) {
    if ('generate' in info) return createWindowedInstanceFromTool(info);
    else                    return createEmbeddedInstanceFromTool(info);
  };
  
  defaultTools.forEach(function(toolInfo) {
    var tool = protoTool.clone();
    tool.find('p').text(toolInfo.name);
    tool.find('img').attr('src', toolInfo.icon);
    tool.appendTo(toolbar);
    tool.click(capture1(createInstanceFromTool, toolInfo));
  });

  instanceCaps.forEach(getAndLaunchInstance);
};

// TODO(arjun): Retreiving vanilla HTML. Not a Belay cap?
$(function() {
  topDiv = $('#aux div').eq(0);
  
  var tunnel = new CapTunnel(window.belayPort);
  tunnel.setOutpostHandler(function(outpost){
    instanceInfo = outpost.info;
    var instancesCap = capServer.restore(instanceInfo.instances);
    instancesCap.get(initialize, function(err) { alert(err.message); });
  });
});
