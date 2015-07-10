function main() {
  var db = new Kinto({
    remote: "http://0.0.0.0:8888/v1",
    headers: {Authorization: "Basic " + btoa("user:pass")}
  });
  var tasks = db.collection("tasks");

  document.getElementById("form")
    .addEventListener("submit", function(event) {
      event.preventDefault();
      tasks.create({
        title: event.target.title.value,
        done: false
      })
      .then(function(res) {
        event.target.title.value = "";
        event.target.title.focus();
      })
      .then(render)
      .catch(function(err) {
        console.error(err);
      });
    });

  document.getElementById("clearCompleted")
    .addEventListener("click", function(event) {
      event.preventDefault();
      tasks.list()
        .then(function(res) {
          var completed = res.data.filter(function(task) {
            return task.done;
          });
          return Promise.all(completed.map(function(task) {
            return tasks.delete(task.id);
          }));
        })
        .then(render)
        .catch(function(err) {
          console.error(err);
        });
    });

  function handleConflicts(conflicts) {
    return Promise.all(conflicts.map(function(conflict) {
      return tasks.resolve(conflict, conflict.remote);
    }))
      .then(function() {
        tasks.sync();
      });
  }

  document.getElementById("sync")
    .addEventListener("click", function(event) {
      event.preventDefault();
      tasks.sync()
        .then(function(res) {
          document.getElementById("results").value = JSON.stringify(res, null, 2);
          if (res.conflicts.length) {
            return handleConflicts(res.conflicts);
          }
          return res;
        })
        .then(render)
        .catch(function(err) {
          console.error(err);
        });
    });

  function renderTask(task) {
    var tpl = document.getElementById("task-tpl");
    var li = tpl.content.cloneNode(true);
    li.querySelector(".title").textContent = task.title;
    li.querySelector(".uuid").textContent = task.id;
    // retrieve a reference to the checkbox element
    var checkbox = li.querySelector(".done");
    // initialize it with task status
    checkbox.checked = task.done;
    // listen to cliecks
    checkbox.addEventListener("click", function(event) {
      // prevent the click to actually toggle the checkbox
      event.preventDefault();
      // invert the task status
      task.done = !task.done;
      // update task status
      tasks.update(task)
        .then(render)
        .catch(function(err) {
          console.error(err);
        });
    });
    return li;
  }

  function renderTasks(tasks) {
    var ul = document.getElementById("tasks");
    ul.innerHTML = "";
    tasks.forEach(function(task) {
      ul.appendChild(renderTask(task));
    });
  }

  function render() {
    tasks.list().then(function(res) {
      renderTasks(res.data);
    }).catch(function(err) {
      console.error(err);
    });
  }

  render();
}

window.addEventListener("DOMContentLoaded", main);
