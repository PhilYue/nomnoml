class App {
  panner: CanvasPanner
  filesystem: FileSystem
  editor: CodeMirrorEditor
  sourceChanged: () => void
  downloader: DownloadLinks
  store: { notices: { text: string }[] } = { notices: [] }
  signals: Observable = new Observable()
  on = this.signals.on
  off = this.signals.off
  defaultSource = `[Pirate|eyeCount: Int|raid();pillage()|
[beard]--[parrot]
[beard]-:>[foul mouth]
]

[<abstract>Marauder]<:--[Pirate]
[Pirate]- 0..7[mischief]
[jollyness]->[Pirate]
[jollyness]->[rum]
[jollyness]->[singing]
[Pirate]-> *[rum|tastiness: Int|swig()]
[Pirate]->[singing]
[singing]<->[rum]

[<start>st]->[<state>plunder]
[plunder]->[<choice>more loot]
[more loot]->[st]
[more loot] no ->[<end>e]

[<actor>Sailor] - [<usecase>shiver me;timbers]`

  constructor(
    nomnoml: Nomnoml,
    codeMirror: CodeMirror,
    saveAs: (blob: Blob, name: string) => void,
    private _: Underscore
  ) {
    var lineNumbers = document.getElementById('linenumbers')
    var lineMarker = document.getElementById('linemarker')
    var textarea = document.getElementById('textarea') as HTMLTextAreaElement
    var canvasElement = document.getElementById('canvas') as HTMLCanvasElement
    var canvasPanner = document.getElementById('canvas-panner')

    this.editor = codeMirror.fromTextArea(textarea, {
      lineNumbers: true,
      mode: 'nomnoml',
      matchBrackets: true,
      theme: 'solarized light',
      keyMap: 'sublime'
    })

    this.editor.on('drop', (cm: any, dragEvent: DragEvent) => {
      var files = dragEvent.dataTransfer.files
      if (files[0].type == 'image/svg+xml') {
        dragEvent.preventDefault()
        this.handleOpeningFiles(files)
      }
    })

    var editorElement = this.editor.getWrapperElement()

    this.filesystem = new FileSystem()
    var devenv = new DevEnv(editorElement, lineMarker, lineNumbers)
    this.panner = new CanvasPanner(canvasPanner, () => this.sourceChanged(), _.throttle)
    this.downloader = new DownloadLinks(canvasElement, saveAs)
    new Tooltips(document.getElementById('tooltip'), document.querySelectorAll('.tools a'))

    var lastValidSource: string = null

    var reloadStorage = () => {
      lastValidSource = null
      this.filesystem.configureByRoute(location.hash).then(() => {
        return this.filesystem.read()
      }).then(source => {
        this.editor.setValue(source || '')
        this.sourceChanged()
      }, (err: Error) => console.log(err))
    }

    window.addEventListener('hashchange', () => reloadStorage());
    window.addEventListener('resize', _.throttle(() => this.sourceChanged(), 750, {leading: true}))
    this.editor.on('changes', _.debounce(() => this.sourceChanged(), 300))

    this.sourceChanged = () => {
      try {
        devenv.clearState()
        var source = this.editor.getValue()
        var model = nomnoml.draw(canvasElement, source, this.panner.zoom())
        lastValidSource = source
        this.panner.positionCanvas(canvasElement)
        this.downloader.source = source
        this.downloader.setFilename(model.config.title)
        this.filesystem.save(source).then(() => {
          this.signals.trigger('source-changed', source)
        })
      } catch (e){
        devenv.setError(e)
        // Rerender canvas with last successfully rendered text.
        if (lastValidSource) {
          nomnoml.draw(canvasElement, lastValidSource, this.panner.zoom())
        }
        this.panner.positionCanvas(canvasElement)
      }
    }

    reloadStorage()
  }

  loadSvg(svg: string) {
    var svgNodes = (new DOMParser()).parseFromString(svg,'text/xml')
    if(svgNodes.getElementsByTagName('desc').length !== 1) {
      this.notify("SVG did not have nomnoml code embedded within it.")
      return
    }
    var code = svgNodes.getElementsByTagName('desc')[0].childNodes[0].nodeValue
    code = this._.unescape(code)
    this.editor.setValue(code)
  }

  currentSource(): string {
    return this.editor.getValue()
  }

  sidebar: null|string = null

  toggleSidebar(id: string){
    this.sidebar = (this.sidebar === id) ? null : id
    var sidebars = ['about', 'reference', 'export', 'files', 'cloud']
    for(var key of sidebars){
      document.getElementById(key).classList.remove('visible')
    }
    if (this.sidebar) {
      document.body.classList.add('sidebar-open')
      document.getElementById(this.sidebar).classList.add('visible')
    }
    else
      document.body.classList.remove('sidebar-open')
  }

  discardCurrentGraph(){
    if (confirm('Do you want to discard current diagram and load the default example?')){
      this.editor.setValue(this.defaultSource)
      this.sourceChanged()
    }
  }

  saveViewModeToStorage(){
    var question =
      'Do you want to overwrite the diagram in ' +
      'localStorage with the currently viewed diagram?'
    if (confirm(question)){
      this.filesystem.moveToLocalStorage(this.currentSource())
      window.location.href = './'
    }
  }

  exitViewMode(){
    window.location.href = './'
  }

  handleOpeningFiles(files: FileList) {
    if(files.length !== 1) {
      this.notify('You can only upload one file at a time.')
      return
    }
    var reader = new FileReader()
    reader.onload = () => this.loadSvg(reader.result as string)
    reader.readAsText(files[0])
  }

  notify(text: string) {
    this.store.notices.push({ text: text })
  }

  closeNotice(notice: Notice) {
    var i = this.store.notices.indexOf(notice)
    this.store.notices.splice(i, 1)
  }
}
