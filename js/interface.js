var $contents = $('#contents');
var $dataSources;
var $tableContents;

var templates = {
  dataSources: template('dataSources'),
  dataSource: template('dataSource'),
  users: template('users')
};

var organizationId = Fliplet.Env.get('organizationId');
var currentDataSource;
var currentDataSourceId;
var currentEditor;

var tinyMCEConfiguration = {
  menubar: false,
  statusbar: false,
  inline: true,
  valid_elements : "tr,th,td[colspan|rowspan],thead,tbody,table,tfoot",
  valid_styles: {},
  plugins: "paste, table",
  gecko_spellcheck: true,
  toolbar: false,
  // contextmenu: "tableprops | cell row column",
  // table_toolbar: "",
  object_resizing: false,
  paste_auto_cleanup_on_paste : false,
  paste_remove_styles: true,
  paste_remove_styles_if_webkit: true
};

// Function to compile a Handlebars template
function template(name) {
  return Handlebars.compile($('#template-' + name).html());
}

// Fetch all data sources
function getDataSources() {
  if (tinymce.editors.length) {
    tinymce.editors[0].remove();
  }

  $contents.html(templates.dataSources());
  $dataSources = $('#data-sources > tbody');

  Fliplet.DataSources.get({ organizationId: organizationId }).then(function (dataSources) {
    dataSources.forEach(renderDataSource);
  });
}

function fetchCurrentDataSourceUsers() {
  var $usersContents = $('.users-contents');

  Fliplet.DataSources.connect(currentDataSourceId).then(function (source) {
    source.getUsers().then(function (users) {
      $usersContents.html(templates.users({ users: users }));
    });
  });
}

function fetchCurrentDataSourceEntries() {
  var columns;

  Fliplet.DataSources.connect(currentDataSourceId).then(function (source) {
    currentDataSource = source;

    return Fliplet.DataSources.getById(currentDataSourceId).then(function (dataSource) {
      columns = dataSource.columns;

      return source.find({});
    });
  }).then(function (rows) {
    if (!rows || !rows.length) {
      rows = [{data: { id: 1, name: 'Sample row 1'}}, {data: {id: 2, name: 'Sample row 2'}}];
    }

    if (!columns) {
      columns = _.union.apply(this, rows.map(function (row) { return Object.keys(row.data); }));
    }

    var $entries = $contents.find('#entries');

    var tableHead = '<tr>' + columns.map(function (column) {
      return '<td>' + column + '</td>';
    }).join('') + '</tr>';

    var tableBody = rows.map(function (row) {
      return '<tr>' + columns.map(function (column) {
        var value = row.data[column] || '';

        if (typeof value === 'object') {
          value = JSON.stringify(value);
        } else if (typeof value === 'string' && value.indexOf('<') !== -1) {
          value = $('<div>').text(value).html();
        }

        return '<td>' + value + '</td>';
      }).join('') + '</tr>';
    }).join('');

    var tableTpl = '<table class="table">' + tableHead + tableBody + '</table>';

    $tableContents.html(tableTpl);
    currentEditor = $tableContents.tinymce(tinyMCEConfiguration);
  });
}

Fliplet.Widget.onSaveRequest(function () {
  saveCurrentData().then(Fliplet.Widget.complete);
});

function saveCurrentData() {
  if (!tinymce.editors.length) {
    return Promise.resolve();
  }

  var $table = $('<div>' + tinymce.editors[0].getContent() + '</div>');

  // Append the table to the dom so "tableToJSON" works fine
  $table.css('visibility', 'hidden');
  $('body').append($table)

  var tableRows = $table.find('table').tableToJSON();

  tableRows.forEach(function (row) {
    Object.keys(row).forEach(function (column) {
      var value = row[column];

      try {
        // Convert value to JSON data when necessary (arrays and objects)
        row[column] = JSON.parse(value);
      }
      catch (e) {
        // Convert value to number when necessary
        if (!isNaN(value)) {
          row[column] = parseFloat(value, 10)
        } else {
          // Convert value to boolean
          if (value === 'true') {
            value = true;
          } else if (value === 'false') {
            value = false;
          }
        }
      }
    });
  });

  return currentDataSource.replaceWith(tableRows);
}

// Append a data source to the DOM
function renderDataSource(data) {
  $dataSources.append(templates.dataSource(data));
}

// events
$('#app')
  .on('click', '[data-back]', function (event) {
    event.preventDefault();
    saveCurrentData().then(function () {
      getDataSources();
    })
  })
  .on('click', '[data-browse-source]', function (event) {
    event.preventDefault();
    currentDataSourceId = $(this).closest('.data-source').data('id');
    var name = $(this).closest('.data-source').find('.data-source-name').text();

    // Prepare the html
    $contents.html('');
    $contents.append('<a href="#" data-back><i class="fa fa-chevron-left"></i> Back to data sources</a>');
    $contents.append('<h1>' + name + '</h1>');
    $contents.append('<div class="table-contents"></div>');
    $contents.append('<div class="users-contents"></div>');
    $tableContents = $contents.find('.table-contents');

    // Input file temporarily disabled
    // $contents.append('<form>Import data: <input type="file" /></form><hr /><div id="entries"></div>');

    fetchCurrentDataSourceEntries();
    fetchCurrentDataSourceUsers();
  })
  .on('click', '[data-delete-source]', function (event) {
    event.preventDefault();
    var $item = $(this).closest('.data-source');

    Fliplet.DataSources.delete($item.data('id')).then(function () {
      $item.remove();
    });
  })
  .on('click', '[data-create-source]', function (event) {
    event.preventDefault();
    var sourceName = prompt('Please type the new table name:');

    if (!sourceName) {
      return;
    }

    Fliplet.DataSources.create({
      organizationId: organizationId,
      name: sourceName
    }).then(renderDataSource);
  })
  .on('change', 'input[type="file"]', function (event) {
    var $input = $(this);
    var file = $input[0].files[0];
    var formData = new FormData();

    formData.append('file', file);

    currentDataSource.import(formData).then(function (files) {
      $input.val('');
      fetchCurrentDataSourceEntries();
    });
  })
  .on('click', '[data-create-role]', function (event) {
    event.preventDefault();
    var userId = prompt('User ID');
    var permissions = prompt('Permissions', 'crud');

    if (!userId || !permissions) {
      return;
    }

    Fliplet.DataSources.connect(currentDataSourceId).then(function (source) {
      return source.addUserRole({
        userId: userId,
        permissions: permissions
      });
    }).then(fetchCurrentDataSourceUsers);
  });

// Fetch data sources when the provider starts
getDataSources();
