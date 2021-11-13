const WebTorrentProperties = require('./index')

const client = new WebTorrentProperties(false)

client.on('error', error => {
    console.log(error)
})

const path = require('path')

client.uploadProp({address: '50105b102fa4e5c666fbdb218393aee25d295c4c1de0e45c814e1ec1fa47c6cc', secret: '928d3dec6b3aa7fe51a553f77d3a87c4ff5fbf4692c03e458996afce754d882950105b102fa4e5c666fbdb218393aee25d295c4c1de0e45c814e1ec1fa47c6cc'}, false, path.resolve('./test1'), {}, (torrent, data) => {
    console.log(torrent.address)
    console.log(data)
})

// client.downloadProp('50105b102fa4e5c666fbdb218393aee25d295c4c1de0e45c814e1ec1fa47c6cc', false, {path: __dirname + '/maintest'}, (torrent, data) => {
//     console.log(torrent)
//     console.log(data)
// })